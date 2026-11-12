import SwiftUI
import FirebaseCore

@main
struct HotdogGolfApp: App {
    @StateObject private var store = Store()
    @StateObject private var cloud = CloudService()

    init() { FirebaseApp.configure() }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .environmentObject(cloud)
                .onAppear { cloud.signIn() }
        }
    }
}

// Which round is live, if any. Identifiable so fullScreenCover can present it.
struct ActiveRound: Identifiable {
    let id = UUID()
    let engine: RoundEngine
    let eventId: String
}

struct RootView: View {
    @EnvironmentObject var store: Store
    @EnvironmentObject var cloud: CloudService
    @State private var active: ActiveRound?
    @State private var setupEvent: WeeklyEvent?
    @State private var showSetup = false

    var body: some View {
        NavigationStack {
            ZStack {
                LinearGradient(colors: [Color(hex: 0x9be7ff), Color(hex: 0xe9fbff), Color(hex: 0xbff0a0)],
                               startPoint: .top, endPoint: .bottom).ignoresSafeArea()
                VStack(spacing: 14) {
                    Text("🌭 Hotdog\nGolf")
                        .font(.system(size: 46, weight: .heavy, design: .rounded))
                        .multilineTextAlignment(.center)
                        .foregroundColor(.white)
                        .shadow(color: INK, radius: 0, x: 3, y: 3)
                        .padding(.top, 30)
                    menuButton("⛳ Play a Round", fill: 0xffd23f) { setupEvent = nil; showSetup = true }
                    menuButton("🏆 Weekly Event", fill: 0x7fd8ff) { setupEvent = WeeklyEvent.current; showSetup = true }
                    NavigationLink { GolferListView() } label: { menuLabel("🌭 Golfers & Tags", fill: 0x7fd8ff) }
                    NavigationLink { HistoryView() } label: { menuLabel("📼 Round History", fill: 0x7fd8ff) }
                    NavigationLink { EventBoardView() } label: { menuLabel("📋 Event Board & Import", fill: 0x7fd8ff) }
                    Spacer()
                }
                .padding(20)
            }
            .navigationBarHidden(true)
            .sheet(isPresented: $showSetup) {
                SetupView(event: setupEvent) { ci, golfers, eventId in
                    showSetup = false
                    let engine = RoundEngine(courseIndex: ci, golfers: golfers, eventId: eventId)
                    active = ActiveRound(engine: engine, eventId: eventId)
                }
            }
            .fullScreenCover(item: $active) { round in
                RoundHost(round: round)
            }
        }
    }

    private func menuButton(_ title: String, fill: UInt32, action: @escaping () -> Void) -> some View {
        Button(action: action) { menuLabel(title, fill: fill) }
    }

    private func menuLabel(_ title: String, fill: UInt32) -> some View {
        Text(title)
            .font(.system(size: 21, weight: .heavy, design: .rounded))
            .foregroundColor(INK)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(Color(hex: fill), in: RoundedRectangle(cornerRadius: 18))
            .overlay(RoundedRectangle(cornerRadius: 18).stroke(INK, lineWidth: 4))
            .padding(.bottom, 6)
    }
}

// Runs a live round and saves it when it finishes.
struct RoundHost: View {
    let round: ActiveRound
    @EnvironmentObject var store: Store
    @EnvironmentObject var cloud: CloudService
    @Environment(\.dismiss) private var dismiss
    @State private var result: FinishedRound?

    var body: some View {
        if let f = result {
            ScorecardView(finished: f, courseIndex: round.engine.courseIndex, eventId: round.eventId) {
                dismiss()
            }
        } else {
            GameView(engine: round.engine, onExit: { dismiss() }, onFinish: { f in
                saveRound(f)
                result = f
            })
        }
    }

    private func saveRound(_ f: FinishedRound) {
        let coded = f.codes(courseIndex: round.engine.courseIndex, eventId: round.eventId)
        let now = Date()
        var newTags: [String: Int] = [:]
        for c in coded {
            store.addRound(RoundRecord(code: c.code, name: String(c.golfer.name.prefix(16)),
                                       course: round.engine.courseIndex, eventId: round.eventId,
                                       score: c.score, date: now))
            if !round.eventId.isEmpty {
                cloud.postEntry(eventId: round.eventId, courseIndex: round.engine.courseIndex,
                                name: c.golfer.name, score: c.score, code: c.code)
            }
        }
        // Tags move by finishing place among the golfers who played.
        newTags = reassignTags(golfers: store.golfers, results: coded.map { (id: $0.golfer.id, score: $0.score) })
        store.applyTags(newTags)
    }
}

struct WeeklyEvent: Equatable {
    let id: String
    let ci: Int
    let name: String
    let end: Date

    static var current: WeeklyEvent {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        let now = Date()
        let year = cal.component(.year, from: now)
        let jan1 = cal.date(from: DateComponents(year: year, month: 1, day: 1))!
        let days = cal.dateComponents([.day], from: jan1, to: now).day ?? 0
        let week = days / 7
        let end = cal.date(byAdding: .day, value: (week + 1) * 7, to: jan1)!
        return WeeklyEvent(id: "\(year)-W\(week)", ci: week % COURSES.count,
                           name: "Week \(week + 1) Challenge", end: end)
    }
}

struct SetupView: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    let event: WeeklyEvent?
    let onStart: (Int, [Golfer], String) -> Void
    @State private var courseIndex = 0
    @State private var picked: Set<String> = []

    var body: some View {
        NavigationStack {
            List {
                Section("Course") {
                    if let e = event {
                        Text("🏆 \(e.name) · \(COURSES[e.ci].name)")
                    } else {
                        Picker("Course", selection: $courseIndex) {
                            ForEach(COURSES.indices, id: \.self) { i in Text(COURSES[i].name).tag(i) }
                        }
                        .pickerStyle(.inline)
                    }
                }
                Section("Who's playing? (up to 4)") {
                    ForEach(tagOrder(store.golfers)) { g in
                        Button {
                            if picked.contains(g.id) { picked.remove(g.id) }
                            else if picked.count < 4 { picked.insert(g.id) }
                        } label: {
                            HStack {
                                Text("#\(g.tag)").bold()
                                Text(g.name)
                                Spacer()
                                if picked.contains(g.id) { Image(systemName: "checkmark.circle.fill") }
                            }
                        }
                        .tint(.primary)
                    }
                }
            }
            .navigationTitle("Tee Off")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Tee Off!") {
                        let golfers = tagOrder(store.golfers).filter { picked.contains($0.id) }
                        guard !golfers.isEmpty else { return }
                        onStart(event?.ci ?? courseIndex, golfers, event?.id ?? "")
                    }
                    .disabled(picked.isEmpty)
                }
            }
            .onAppear {
                if picked.isEmpty, let first = tagOrder(store.golfers).first { picked.insert(first.id) }
            }
        }
    }
}
