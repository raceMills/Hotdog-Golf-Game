import Foundation
import FirebaseAuth
import FirebaseFirestore

// Firebase: anonymous sign-in, shared event leaderboards, and live match progress.
// Nothing from the cloud is trusted. Every entry carries a share code, and the phone
// replays it with verifyCode() before showing it.

struct BoardEntry: Identifiable {
    let id: String
    let name: String
    let score: Int
}

final class CloudService: ObservableObject {
    @Published private(set) var uid: String?
    private let db = Firestore.firestore()

    func signIn(completion: @escaping (Error?) -> Void = { _ in }) {
        if let u = Auth.auth().currentUser { uid = u.uid; completion(nil); return }
        Auth.auth().signInAnonymously { [weak self] result, error in
            if let u = result?.user { self?.uid = u.uid }
            completion(error)
        }
    }

    // MARK: Event leaderboard

    // Posts a verified round so friends can see it on the event board.
    func postEntry(eventId: String, courseIndex: Int, name: String, score: Int, code: String) {
        guard let uid = uid else { return }
        db.collection("events").document(eventId).collection("entries").document(code).setData([
            "uid": uid,
            "name": name,
            "course": courseIndex,
            "score": score,
            "code": code,
            "posted": FieldValue.serverTimestamp()
        ], merge: true)
    }

    // Loads the board for an event, re-verifying each code. Forged or mismatched entries drop out.
    func loadBoard(eventId: String, courseIndex: Int, completion: @escaping ([BoardEntry]) -> Void) {
        db.collection("events").document(eventId).collection("entries")
            .whereField("course", isEqualTo: courseIndex)
            .getDocuments { snapshot, _ in
                let docs = snapshot?.documents ?? []
                var best: [String: BoardEntry] = [:]
                for doc in docs {
                    guard let code = doc.data()["code"] as? String,
                          let v = try? verifyCode(code), v.eventId == eventId, v.course == courseIndex else { continue }
                    let e = BoardEntry(id: code, name: v.name, score: v.score)
                    if best[v.name] == nil || e.score < best[v.name]!.score { best[v.name] = e }
                }
                completion(best.values.sorted { $0.score < $1.score })
            }
    }

    // MARK: Live match

    // Host creates a match. Friends join with the match code.
    func createMatch(matchId: String, courseIndex: Int) {
        guard let uid = uid else { return }
        db.collection("matches").document(matchId).setData([
            "host": uid, "course": courseIndex, "created": FieldValue.serverTimestamp()
        ])
    }

    // Each player publishes their shots so far. Strokes and holes are derived from the shots on the other side.
    func publishProgress(matchId: String, golferName: String, holeIndex: Int, shotsByHole: [[[Double]]], totalStrokes: Int) {
        guard let uid = uid else { return }
        let flat = shotsByHole.map { $0.flatMap { $0 } }
        db.collection("matches").document(matchId).collection("players").document(uid).setData([
            "name": golferName,
            "hole": holeIndex,
            "strokes": totalStrokes,
            "holes": flat,
            "updated": FieldValue.serverTimestamp()
        ], merge: true)
    }

    // Live listener for everyone else's progress. Returns the listener so the caller can remove it.
    func listenToMatch(matchId: String, onChange: @escaping ([[String: Any]]) -> Void) -> ListenerRegistration {
        db.collection("matches").document(matchId).collection("players")
            .addSnapshotListener { snapshot, _ in
                onChange(snapshot?.documents.map { $0.data() } ?? [])
            }
    }
}
