import SwiftUI

// Scorecard shown after a round: each golfer's code with copy and share.
struct ScorecardView: View {
    let finished: FinishedRound
    let courseIndex: Int
    let eventId: String
    let onDone: () -> Void

    var body: some View {
        let par = parOf(courseIndex)
        let rows = finished.codes(courseIndex: courseIndex, eventId: eventId).sorted { $0.score < $1.score }
        NavigationStack {
            List {
                Section("\(COURSES[courseIndex].name) · Par \(par)") {
                    ForEach(Array(rows.enumerated()), id: \.offset) { i, r in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text("\(i + 1). \(r.golfer.name)").bold()
                                Text("#\(r.golfer.tag)").font(.caption).padding(.horizontal, 6).background(.yellow, in: Capsule())
                                Spacer()
                                Text("\(r.score) (\(toPar(r.score, par)))")
                            }
                            Text(r.code).font(.caption2).foregroundStyle(.secondary).lineLimit(2)
                            ShareLink(item: r.code) { Label("Send code", systemImage: "square.and.arrow.up") }
                                .font(.callout.bold())
                        }
                        .padding(.vertical, 4)
                    }
                }
                Section {
                    Text("Friends paste a code on their Event Board screen to add the score.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Scorecard")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done", action: onDone) }
            }
        }
    }
}

func toPar(_ score: Int, _ par: Int) -> String {
    let d = score - par
    return d == 0 ? "E" : (d > 0 ? "+\(d)" : "\(d)")
}

// Golfers and tags. Tag 1 is the best. New golfers join last.
struct GolferListView: View {
    @EnvironmentObject var store: Store
    @State private var editing: Golfer?
    @State private var showEditor = false

    var body: some View {
        List {
            Section {
                ForEach(tagOrder(store.golfers)) { g in
                    Button { editing = g; showEditor = true } label: {
                        HStack {
                            Text("#\(g.tag)").bold().padding(.horizontal, 8).background(.yellow, in: Capsule())
                            Text(g.name)
                            Spacer()
                            Image(systemName: "chevron.right").foregroundStyle(.tertiary)
                        }
                    }
                    .tint(.primary)
                }
                .onDelete { idx in
                    let ordered = tagOrder(store.golfers)
                    for i in idx { store.removeGolfer(id: ordered[i].id) }
                }
            } footer: {
                Text("Tag 1 is the best. New golfers join last. Tags move after every round you play.")
            }
            Section {
                Button("🎲 Shuffle All Tags") {
                    let nums = shuffledTags(count: store.golfers.count)
                    var out: [String: Int] = [:]
                    for (g, t) in zip(store.golfers, nums) { out[g.id] = t }
                    store.applyTags(out)
                }
            }
        }
        .navigationTitle("Golfers & Tags")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    editing = Golfer(name: "", tag: nextTag(after: store.golfers))
                    showEditor = true
                } label: { Image(systemName: "plus") }
            }
        }
        .sheet(isPresented: $showEditor) {
            if let g = editing { GolferEditor(golfer: g) }
        }
    }
}

struct GolferEditor: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    @State var golfer: Golfer
    private var isNew: Bool { !store.golfers.contains(where: { $0.id == golfer.id }) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack { Spacer(); HotdogPreview(golfer: golfer); Spacer() }
                }
                Section("Name") {
                    TextField("Hotdog name", text: $golfer.name)
                        .onChange(of: golfer.name) { golfer.name = String($0.prefix(16)) }
                }
                Section("Bun") {
                    HStack { ForEach(BUNS.indices, id: \.self) { i in swatch(BUNS[i], selected: golfer.bun == i) { golfer.bun = i } } }
                }
                Section("Topping") {
                    HStack { ForEach(TOPPINGS.indices, id: \.self) { i in swatch(TOPPINGS[i], selected: golfer.topping == i) { golfer.topping = i } } }
                }
                Section("Hat") {
                    Picker("Hat", selection: $golfer.hat) {
                        ForEach(HATS, id: \.self) { Text(HAT_NAMES[$0] ?? $0).tag($0) }
                    }
                    .pickerStyle(.segmented)
                }
            }
            .navigationTitle(isNew ? "New Hotdog" : "Edit Hotdog")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        golfer.name = golfer.name.trimmingCharacters(in: .whitespaces)
                        guard !golfer.name.isEmpty else { return }
                        if let i = store.golfers.firstIndex(where: { $0.id == golfer.id }) {
                            store.golfers[i] = golfer
                        } else {
                            store.golfers.append(golfer)
                        }
                        dismiss()
                    }
                }
            }
        }
    }

    private func swatch(_ c: Color, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Circle().fill(c).frame(width: 36, height: 36)
                .overlay(Circle().stroke(INK, lineWidth: 3))
                .overlay(Circle().stroke(.white, lineWidth: selected ? 3 : 0).padding(3))
        }
        .buttonStyle(.plain)
    }
}

// Small drawing of a golfer using the same drawing code as the course.
struct HotdogPreview: View {
    let golfer: Golfer
    var body: some View {
        Canvas { ctx, size in
            var c = ctx
            drawHotdog(&c, golfer, at: CGPoint(x: size.width / 2, y: size.height / 2), scale: 3.4)
        }
        .frame(width: 140, height: 140)
        .background(Color(hex: 0xfff8e7), in: RoundedRectangle(cornerRadius: 20))
    }
}

// Round history: replay or copy any saved round.
struct HistoryView: View {
    @EnvironmentObject var store: Store
    @State private var watching: RoundRecord?

    var body: some View {
        List {
            if store.rounds.isEmpty {
                Text("No rounds yet. Tee off!").foregroundStyle(.secondary)
            }
            ForEach(store.rounds.sorted { $0.date > $1.date }) { r in
                VStack(alignment: .leading, spacing: 4) {
                    Text(r.name).bold() + Text(" · \(COURSES[r.course].name)\(r.eventId.isEmpty ? "" : " · 🏆")")
                    Text("Score \(r.score) (\(toPar(r.score, parOf(r.course)))) · \(r.date.formatted(date: .abbreviated, time: .omitted))")
                        .font(.footnote).foregroundStyle(.secondary)
                    HStack {
                        Button("▶ Watch") { watching = r }
                        ShareLink(item: r.code) { Label("Send", systemImage: "square.and.arrow.up") }
                    }
                    .buttonStyle(.bordered)
                }
                .padding(.vertical, 4)
            }
            .onDelete { idx in
                let sorted = store.rounds.sorted { $0.date > $1.date }
                for i in idx { store.deleteRound(code: sorted[i].code) }
            }
        }
        .navigationTitle("Round History")
        .sheet(item: $watching) { r in
            ReplayView(record: r)
        }
    }
}

// Replays a verified round on the course, shot by shot.
struct ReplayView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var engine: RoundEngine
    private let ok: Bool

    init(record: RoundRecord) {
        if let v = try? verifyCode(record.code) {
            let golfer = Golfer(name: v.name, tag: 0)
            _engine = StateObject(wrappedValue: RoundEngine(courseIndex: v.course, golfers: [golfer],
                                                            replayScript: v.holes))
            ok = true
        } else {
            // Placeholder engine so the property is always set; the view shows an error instead.
            _engine = StateObject(wrappedValue: RoundEngine(courseIndex: 0, golfers: [], replayScript: []))
            ok = false
        }
    }

    var body: some View {
        if ok {
            GameView(engine: engine, onExit: { dismiss() }, onFinish: { _ in dismiss() })
        } else {
            Text("This round can't be replayed.")
        }
    }
}

// Event board: this week's standings, plus pasting friends' codes.
struct EventBoardView: View {
    @EnvironmentObject var store: Store
    @EnvironmentObject var cloud: CloudService
    @State private var board: [BoardEntry] = []
    @State private var pasted = ""
    @State private var message = ""
    private let event = WeeklyEvent.current

    var body: some View {
        List {
            Section {
                Text("\(event.name) · \(COURSES[event.ci].name)").bold()
                Text("Ends \(event.end.formatted(date: .abbreviated, time: .omitted)). Lowest total strokes wins.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            Section("Leaderboard") {
                if board.isEmpty { Text("No scores yet. Be the first hotdog on the board!") }
                ForEach(Array(board.enumerated()), id: \.offset) { i, e in
                    HStack {
                        Text("\(i + 1)").frame(width: 28, alignment: .leading)
                        Text(e.name)
                        Spacer()
                        Text("\(e.score) (\(toPar(e.score, parOf(event.ci))))")
                    }
                }
            }
            Section("Paste a friend's code") {
                TextEditor(text: $pasted).frame(minHeight: 80).font(.system(.body, design: .monospaced))
                Button("Add Scores") { importPasted() }
                if !message.isEmpty { Text(message).font(.footnote) }
            }
        }
        .navigationTitle("Event Board")
        .onAppear(perform: reload)
    }

    private func reload() {
        cloud.loadBoard(eventId: event.id, courseIndex: event.ci) { entries in
            DispatchQueue.main.async { board = entries }
        }
    }

    // Verifies each pasted code locally, saves it, and posts it to the shared board.
    private func importPasted() {
        let codes = findCodes(in: pasted)
        guard !codes.isEmpty else { message = "No codes found. Codes start with HDG1:"; return }
        var lines: [String] = []
        for code in codes {
            do {
                let v = try verifyCode(code)
                let added = store.addRound(RoundRecord(code: v.code, name: v.name, course: v.course,
                                                       eventId: v.eventId, score: v.score, date: Date()))
                if !v.eventId.isEmpty && v.eventId == event.id {
                    cloud.postEntry(eventId: v.eventId, courseIndex: v.course, name: v.name, score: v.score, code: v.code)
                }
                lines.append((added ? "✓ Added " : "• Already had ") + "\(v.name): \(v.score) strokes")
            } catch {
                lines.append("✗ \(error.localizedDescription)")
            }
        }
        message = lines.joined(separator: "\n")
        pasted = ""
        reload()
    }
}
