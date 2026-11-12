import Foundation
import Combine

// A hotdog golfer. Looks are stored as small indexes into the palettes in Palette.swift.
struct Golfer: Codable, Identifiable, Equatable {
    var id: String = UUID().uuidString
    var name: String
    var bun: Int = 0
    var topping: Int = 0
    var hat: String = "cap"   // cap, visor, bucket, chef
    var tag: Int
}

// One finished round for one golfer. `code` is the replayable proof.
struct RoundRecord: Codable, Identifiable, Equatable {
    var id: String { code }
    let code: String
    let name: String
    let course: Int
    let eventId: String
    let score: Int
    let date: Date
}

// Local storage. Everything lives on the phone; Firebase only carries live matches and
// event leaderboards.
final class Store: ObservableObject {
    @Published var golfers: [Golfer] { didSet { didSave() } }
    @Published var rounds: [RoundRecord] { didSet { didSave() } }

    private let key = "hotdogGolf.v1"

    init() {
        if let data = UserDefaults.standard.data(forKey: key),
           let saved = try? JSONDecoder().decode(Saved.self, from: data) {
            golfers = saved.golfers; rounds = saved.rounds
        } else {
            golfers = [Golfer(name: "Hotdog 1", tag: 1)]
            rounds = []
        }
    }

    private struct Saved: Codable { var golfers: [Golfer]; var rounds: [RoundRecord] }

    private func didSave() {
        let data = try? JSONEncoder().encode(Saved(golfers: golfers, rounds: rounds))
        UserDefaults.standard.set(data, forKey: key)
    }

    @discardableResult
    func addRound(_ r: RoundRecord) -> Bool {
        guard !rounds.contains(where: { $0.code == r.code }) else { return false }
        rounds.append(r)
        return true
    }

    func deleteRound(code: String) {
        rounds.removeAll { $0.code == code }
    }

    func applyTags(_ newTags: [String: Int]) {
        golfers = golfers.map { g in
            var g = g
            if let t = newTags[g.id] { g.tag = t }
            return g
        }
    }

    // Removes a golfer and closes the gap so tags stay 1...N.
    func removeGolfer(id: String) {
        guard golfers.count > 1 else { return }
        golfers.removeAll { $0.id == id }
        let ordered = tagOrder(golfers)
        golfers = golfers.map { g in
            var g = g
            g.tag = (ordered.firstIndex(where: { $0.id == g.id }) ?? 0) + 1
            return g
        }
    }
}
