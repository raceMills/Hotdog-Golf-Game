import SwiftUI

// Runs one round: turn order, shot animation, hole completion. Physics come from Sim.swift.

struct BallState {
    var pos: V
    var done = false
    var sunk = false
    var strokes = 0
    var shots: [[Double]] = []   // [vx, vy] per shot
}

struct ShotAnim {
    let ball: Int
    let pts: [V]
    let x: Double, y: Double
    let sunk: Bool
    let pen: Bool
    var i: Double = 0
}

struct FinishedRound {
    let golfers: [Golfer]
    let scores: [Int]
    let shotLists: [[[[Double]]]]   // [golfer][hole][shot][vx,vy]
}

final class RoundEngine: ObservableObject {
    let courseIndex: Int
    let course: Course
    let golfers: [Golfer]
    let eventId: String
    let isReplay: Bool
    private let script: [[Double]]?   // replay only: flat [vx,vy,...] per hole

    @Published var holeIndex = 0
    @Published var balls: [BallState] = []
    @Published var turn = 0
    @Published var busy = false
    @Published var anim: ShotAnim?
    @Published var dragFrom: V?          // pointer position in world units
    @Published var dragVec: ShotVec?     // current shot vector
    @Published var preview: ShotResult?
    @Published var summaryHole: Int?     // set while the "hole done" card is showing
    @Published var finished: FinishedRound?

    private var holeStrokes: [[Int]] = []    // [golfer][hole]
    private var holeShots: [[[[Double]]]] = []  // [golfer][hole][shot]
    private var timer: Timer?

    init(courseIndex: Int, golfers: [Golfer], eventId: String = "", replayScript: [[Double]]? = nil) {
        self.courseIndex = courseIndex
        self.course = COURSES[courseIndex]
        self.golfers = golfers
        self.eventId = eventId
        self.script = replayScript
        self.isReplay = replayScript != nil
        holeStrokes = golfers.map { _ in [] }
        holeShots = golfers.map { _ in [] }
        timer = Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { [weak self] _ in
            self?.tick()
        }
        beginHole()
    }

    deinit { timer?.invalidate() }

    var hole: Hole { course.holes[holeIndex] }

    func beginHole() {
        let h = hole
        balls = golfers.map { _ in BallState(pos: h.tee) }
        turn = 0; busy = false; anim = nil; dragFrom = nil; dragVec = nil; preview = nil
        summaryHole = nil
        nextTurn()
    }

    private func nextTurn() {
        let n = golfers.count
        for k in 0..<n {
            let i = (turn + k) % n
            if !balls[i].done {
                turn = i
                if isReplay { DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in self?.autoShot() } }
                return
            }
        }
        holeFinished()
    }

    // Live shot from the player whose turn it is.
    func takeShot(_ v: ShotVec) {
        let i = turn
        let b = balls[i]
        let r = simulate(hole, b.pos.x, b.pos.y, v.vx, v.vy)
        balls[i].shots.append([v.vx, v.vy])
        balls[i].strokes += r.pen ? 2 : 1
        busy = true
        preview = nil; dragFrom = nil; dragVec = nil
        anim = ShotAnim(ball: i, pts: r.path, x: r.x, y: r.y, sunk: r.sunk, pen: r.pen)
    }

    private func autoShot() {
        guard isReplay, !busy, anim == nil, let script = script else { return }
        let b = balls[turn]
        let flat = script[holeIndex]
        let k = b.shots.count
        if !b.done && k * 2 < flat.count {
            let v = ShotVec(vx: flat[2 * k], vy: flat[2 * k + 1], m: 0)
            takeShot(v)
        }
    }

    // Called every frame: moves the animating ball and finishes the shot when it lands.
    private func tick() {
        guard var a = anim else { return }
        a.i += 2
        if a.i >= Double(a.pts.count - 1) {
            anim = nil
            land(a)
        } else {
            anim = a
        }
    }

    private func land(_ a: ShotAnim) {
        busy = false
        balls[a.ball].pos = V(x: a.x, y: a.y)
        if a.sunk { balls[a.ball].sunk = true; balls[a.ball].done = true }
        else if balls[a.ball].strokes >= MAX_STROKES { balls[a.ball].done = true }
        turn = (turn + 1) % golfers.count
        nextTurn()
    }

    private func holeFinished() {
        for i in golfers.indices {
            holeStrokes[i].append(balls[i].strokes)
            holeShots[i].append(balls[i].shots)
        }
        let done = holeIndex
        if done + 1 >= course.holes.count {
            finishRound()
            return
        }
        if isReplay {
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self] in
                guard let self = self, self.isReplay else { return }
                self.holeIndex += 1
                self.beginHole()
            }
            return
        }
        summaryHole = done
    }

    // Player tapped "Next Hole" on the hole summary.
    func nextHole() {
        holeIndex += 1
        beginHole()
    }

    private func finishRound() {
        if isReplay { finished = FinishedRound(golfers: golfers, scores: [], shotLists: []); return }
        let scores = holeStrokes.map { $0.reduce(0, +) }
        finished = FinishedRound(golfers: golfers, scores: scores, shotLists: holeShots.map { $0 })
    }

    // Drag handling. Pull back from the ball; the shot flies the opposite way.
    func dragChanged(to p: V) {
        guard !isReplay, !busy, anim == nil, summaryHole == nil, finished == nil, !balls[turn].done else { return }
        let b = balls[turn]
        dragFrom = p
        let v = shotVel(b.pos.x - p.x, b.pos.y - p.y)
        dragVec = v
        preview = v.m > 0.4 ? simulate(hole, b.pos.x, b.pos.y, v.vx, v.vy) : nil
    }

    func dragEnded() {
        let v = dragVec
        dragFrom = nil; dragVec = nil; preview = nil
        if let v = v, v.m > 0.4 { takeShot(v) }
    }

    var currentGolfer: Golfer? { golfers.indices.contains(turn) ? golfers[turn] : nil }

    // Strokes a golfer took on a finished hole (for the summary card).
    func holeStrokesOf(golfer i: Int, hole h: Int) -> Int {
        guard holeStrokes.indices.contains(i), holeStrokes[i].indices.contains(h) else { return 0 }
        return holeStrokes[i][h]
    }
}

// Code and score bookkeeping for a finished live round.
extension FinishedRound {
    // shotLists as [golfer][hole][shot] -> [golfer][hole] flat arrays for encodeRound.
    func codes(courseIndex: Int, eventId: String) -> [(golfer: Golfer, score: Int, code: String)] {
        golfers.indices.map { gi in
            let name = String(golfers[gi].name.trimmingCharacters(in: .whitespaces).prefix(16))
            let holes = shotLists[gi]
            let code = encodeRound(name: name, course: courseIndex, eventId: eventId,
                                   score: scores[gi], shotLists: holes)
            return (golfers[gi], scores[gi], code)
        }
    }
}
