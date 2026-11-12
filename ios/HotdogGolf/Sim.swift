import Foundation

// Deterministic physics and share-code verification. This is a line-for-line port of the
// web prototype's sim.js. Every phone must produce identical shots, so keep the same
// operation order, the same constants, and only + - * / and sqrt (no sin/cos).

let W = 360.0, H = 600.0, BR = 5.0, GREEN_R = 30.0, CUP_R = 6.0, SINK_V = 3.5
let MAX_STROKES = 10, MAX_FRAMES = 900
let MAXV = 11.0, STOP2 = 0.0016

struct V: Codable, Equatable { var x: Double; var y: Double }
struct Rect: Codable { var x, y, w, h: Double }
struct Circ: Codable { var x, y, r: Double }

struct Hazard {
    let t: String          // "sand" or "water"
    let rect: Rect?
    let circ: Circ?
}

struct Hole {
    let par: Int
    let tee: V
    let cup: V
    let fair: [Rect]
    let haz: [Hazard]
    let walls: [Rect]
    let trees: [Circ]
}

struct Body { var x, y, vx, vy: Double }

struct ShotResult {
    var path: [V]
    var x: Double, y: Double
    var sunk: Bool
    var pen: Bool
}

let FRIC: [String: Double] = ["fairway": 0.982, "green": 0.968, "rough": 0.948, "sand": 0.86]

func inRect(_ r: Rect, _ x: Double, _ y: Double) -> Bool {
    x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h
}

func inHaz(_ z: Hazard, _ x: Double, _ y: Double) -> Bool {
    if let c = z.circ {
        let dx = x - c.x, dy = y - c.y
        return dx * dx + dy * dy < c.r * c.r
    }
    guard let r = z.rect else { return false }
    return inRect(r, x, y)
}

func zoneAt(_ h: Hole, _ x: Double, _ y: Double) -> String {
    if x < 0 || x > W || y < 0 || y > H { return "out" }
    let gx = x - h.cup.x, gy = y - h.cup.y
    if gx * gx + gy * gy < GREEN_R * GREEN_R { return "green" }
    for z in h.haz where inHaz(z, x, y) { return z.t }
    for r in h.fair where inRect(r, x, y) { return "fairway" }
    return "rough"
}

func collideRect(_ b: inout Body, _ r: Rect) {
    let cx = min(max(b.x, r.x), r.x + r.w)
    let cy = min(max(b.y, r.y), r.y + r.h)
    let dx = b.x - cx, dy = b.y - cy
    let d2 = dx * dx + dy * dy
    if d2 >= BR * BR { return }
    if d2 == 0 { b.x -= b.vx; b.y -= b.vy; b.vx *= -0.5; b.vy *= -0.5; return }
    let d = d2.squareRoot(), nx = dx / d, ny = dy / d
    b.x = cx + nx * BR; b.y = cy + ny * BR
    let vn = b.vx * nx + b.vy * ny
    if vn < 0 { let k = 1.55 * vn; b.vx -= k * nx; b.vy -= k * ny }
}

func collideCircle(_ b: inout Body, _ c: Circ) {
    let dx = b.x - c.x, dy = b.y - c.y
    let R = BR + c.r
    let d2 = dx * dx + dy * dy
    if d2 >= R * R { return }
    var d = d2.squareRoot()
    if d == 0 { d = 1e-6 }
    let nx = dx / d, ny = dy / d
    b.x = c.x + nx * R; b.y = c.y + ny * R
    let vn = b.vx * nx + b.vy * ny
    if vn < 0 { let k = 1.7 * vn; b.vx -= k * nx; b.vy -= k * ny }
}

// Simulates one shot from (sx, sy) with velocity (vx, vy). Pure function.
func simulate(_ h: Hole, _ sx: Double, _ sy: Double, _ vx: Double, _ vy: Double) -> ShotResult {
    var b = Body(x: sx, y: sy, vx: vx, vy: vy)
    var path = [V(x: sx, y: sy)]
    for _ in 0..<MAX_FRAMES {
        b.x += b.vx; b.y += b.vy
        let z = zoneAt(h, b.x, b.y)
        if z == "out" || z == "water" {
            path.append(V(x: b.x, y: b.y))
            return ShotResult(path: path, x: sx, y: sy, sunk: false, pen: true)
        }
        let fr = FRIC[z] ?? FRIC["rough"]!
        b.vx *= fr; b.vy *= fr
        for r in h.walls { collideRect(&b, r) }
        for t in h.trees { collideCircle(&b, t) }
        path.append(V(x: b.x, y: b.y))
        let gx = b.x - h.cup.x, gy = b.y - h.cup.y
        let sp2 = b.vx * b.vx + b.vy * b.vy
        if gx * gx + gy * gy < CUP_R * CUP_R && sp2 < SINK_V * SINK_V {
            return ShotResult(path: path, x: h.cup.x, y: h.cup.y, sunk: true, pen: false)
        }
        if sp2 < STOP2 { break }
    }
    return ShotResult(path: path, x: b.x, y: b.y, sunk: false, pen: false)
}

// JavaScript Math.round: rounds halves toward +infinity. Swift's .rounded() differs,
// so use this to match the web version exactly.
func jsRound(_ x: Double) -> Double { (x + 0.5).rounded(.down) }

struct ShotVec { var vx: Double; var vy: Double; var m: Double }

// Drag vector (ball minus pointer) to a rounded shot velocity. No trig.
func shotVel(_ dx: Double, _ dy: Double) -> ShotVec {
    var vx = dx * 0.12, vy = dy * 0.12
    var m = (vx * vx + vy * vy).squareRoot()
    if m > MAXV { vx *= MAXV / m; vy *= MAXV / m; m = MAXV }
    return ShotVec(vx: jsRound(vx * 100) / 100, vy: jsRound(vy * 100) / 100, m: m)
}

// MARK: - Share codes ("HDG1:" + base64url of JSON)

struct VerifiedRound {
    let name: String, course: Int, eventId: String, score: Int
    let holes: [[Double]]   // flat [vx, vy, vx, vy, ...] per hole
    let code: String
}

enum CodeError: Error, LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let s) = self { return s }; return nil }
}

func encodeRound(name: String, course: Int, eventId: String, score: Int, shotLists: [[[Double]]]) -> String {
    let holes: [[Double]] = shotLists.map { $0.flatMap { $0 } }
    let obj: [String: Any] = ["v": 1, "n": name, "c": course, "e": eventId, "s": score, "h": holes]
    let data = try! JSONSerialization.data(withJSONObject: obj, options: [.sortedKeys])
    return "HDG1:" + base64URL(data)
}

func base64URL(_ data: Data) -> String {
    data.base64EncodedString()
        .replacingOccurrences(of: "+", with: "-")
        .replacingOccurrences(of: "/", with: "_")
        .replacingOccurrences(of: "=", with: "")
}

func decodeBase64URL(_ s: String) -> Data? {
    var t = s.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
    while t.count % 4 != 0 { t += "=" }
    return Data(base64Encoded: t)
}

// Pulls the first "HDG1:..." token out of pasted text.
func findCodes(in text: String) -> [String] {
    var out: [String] = []
    var rest = Substring(text)
    while let r = rest.range(of: "HDG1:") {
        var end = r.upperBound
        while end < rest.endIndex, rest[end].isLetter || rest[end].isNumber || rest[end] == "-" || rest[end] == "_" {
            end = rest.index(after: end)
        }
        out.append(String(rest[r.lowerBound..<end]))
        rest = rest[end...]
    }
    return out
}

// Replays every shot in a code and checks the claimed score.
func verifyCode(_ text: String) throws -> VerifiedRound {
    guard let code = findCodes(in: text).first else { throw CodeError.message("Not a Hotdog Golf code") }
    guard let data = decodeBase64URL(String(code.dropFirst(5))),
          let d = try JSONSerialization.jsonObject(with: data) as? [String: Any],
          let ci = d["c"] as? Int, ci >= 0, ci < COURSES.count,
          let n = d["n"] as? String, let s = d["s"] as? Int,
          let hs = d["h"] as? [[Double]] else { throw CodeError.message("Could not read this code") }
    let course = COURSES[ci]
    guard hs.count == course.holes.count else { throw CodeError.message("Wrong number of holes") }
    var total = 0
    for (hi, h) in course.holes.enumerated() {
        let flat = hs[hi]
        guard flat.count % 2 == 0, flat.count <= MAX_STROKES * 2 else { throw CodeError.message("Bad shot data") }
        var x = h.tee.x, y = h.tee.y, strokes = 0, k = 0
        var done = false
        while !done {
            guard k * 2 < flat.count else { throw CodeError.message("Hole \(hi + 1) is unfinished") }
            let vx = flat[2 * k], vy = flat[2 * k + 1]; k += 1
            guard abs(vx) <= MAXV, abs(vy) <= MAXV else { throw CodeError.message("Bad shot") }
            let r = simulate(h, x, y, vx, vy)
            strokes += r.pen ? 2 : 1; x = r.x; y = r.y
            done = r.sunk || strokes >= MAX_STROKES
        }
        guard k * 2 == flat.count else { throw CodeError.message("Extra shots on hole \(hi + 1)") }
        total += strokes
    }
    guard total == s else { throw CodeError.message("Score does not match the shots") }
    return VerifiedRound(name: String(n.prefix(16)), course: ci, eventId: (d["e"] as? String) ?? "",
                         score: total, holes: hs, code: code)
}
