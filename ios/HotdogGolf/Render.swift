import SwiftUI

// Cartoon drawing, ported from render.js. All coordinates are course world units (360 x 600).

let BUNS: [Color] = [Color(hex: 0xf3c27a), Color(hex: 0xe8a85c), Color(hex: 0xd98c45), Color(hex: 0xc97a3a), Color(hex: 0xf7d9a8)]
let TOPPINGS: [Color] = [Color(hex: 0xe53935), Color(hex: 0xffd23f), Color(hex: 0x8bc34a), Color(hex: 0xff9f43)]
let TOPPING_NAMES = ["Ketchup", "Mustard", "Relish", "Onion"]
let HATS = ["cap", "visor", "bucket", "chef"]
let HAT_NAMES = ["cap": "Cap", "visor": "Visor", "bucket": "Bucket", "chef": "Chef"]
let INK = Color(hex: 0x1d2b1a)
let SAUSAGE = Color(hex: 0xd64541)
let HAZ_COLOR: [String: Color] = ["sand": Color(hex: 0xf7e3a1), "water": Color(hex: 0x4cc9f0)]

// Draws a hotdog golfer centred on (0, 0) in local units (about 40 tall at scale 1).
func drawHotdog(_ ctx: inout GraphicsContext, _ g: Golfer, at p: CGPoint, scale s: CGFloat) {
    var c = ctx
    c.translateBy(x: p.x, y: p.y)
    c.scaleBy(x: s, y: s)
    let bun = BUNS[min(max(g.bun, 0), BUNS.count - 1)]
    let top = TOPPINGS[min(max(g.topping, 0), TOPPINGS.count - 1)]
    let lw: CGFloat = 1.4

    func box(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ r: CGFloat) -> Path {
        Path(roundedRect: CGRect(x: x, y: y, width: w, height: h), cornerRadius: r)
    }
    func fillStroke(_ path: Path, _ color: Color) {
        c.fill(path, with: .color(color))
        c.stroke(path, with: .color(INK), style: StrokeStyle(lineWidth: lw, lineJoin: .round))
    }

    fillStroke(box(-12, -2, 24, 16, 8), SAUSAGE)     // sausage
    fillStroke(box(-13, 6, 26, 10, 5), bun)           // bun
    fillStroke(box(-9, 3, 18, 4, 2), top)             // topping stripe

    // Eyes, smile, cheeks
    for ex in [CGFloat(-4), CGFloat(4)] {
        c.fill(Path(ellipseIn: CGRect(x: ex - 1.6, y: 0.5 - 1.6, width: 3.2, height: 3.2)), with: .color(INK))
    }
    var smile = Path()
    smile.addArc(center: CGPoint(x: 0, y: 2), radius: 2.6, startAngle: .radians(0.2), endAngle: .radians(Double.pi - 0.2), clockwise: false)
    c.stroke(smile, with: .color(INK), lineWidth: lw)
    for cx in [CGFloat(-7.5), CGFloat(7.5)] {
        c.fill(Path(ellipseIn: CGRect(x: cx - 2, y: 3.5 - 2, width: 4, height: 4)), with: .color(Color(red: 1, green: 0.35, blue: 0.43).opacity(0.4)))
    }

    // Hat
    let hatColor: Color = g.hat == "bucket" ? Color(hex: 0xf2e8cf) : (g.hat == "chef" ? .white : Color(hex: 0x2b2d42))
    switch g.hat {
    case "visor":
        fillStroke(box(-11, -6, 22, 3.5, 1.5), hatColor)
    case "bucket":
        var crown = Path()
        crown.addArc(center: CGPoint(x: 0, y: -6), radius: 10.5, startAngle: .radians(Double.pi), endAngle: .radians(0), clockwise: false)
        crown.closeSubpath()
        fillStroke(crown, hatColor)
        fillStroke(Path(ellipseIn: CGRect(x: -13, y: -5.5 - 3.2, width: 26, height: 6.4)), hatColor)
    case "chef":
        fillStroke(box(-8, -20, 16, 12, 5), hatColor)
        fillStroke(box(-8, -10, 16, 4, 1), hatColor)
    default: // cap
        var crown = Path()
        crown.addArc(center: CGPoint(x: 0, y: -4), radius: 10, startAngle: .radians(Double.pi), endAngle: .radians(0), clockwise: false)
        crown.closeSubpath()
        fillStroke(crown, hatColor)
        fillStroke(box(-3, -5, 15, 3, 1.5), hatColor)
    }
}

// Shapes for filling and outlining.
private func shapePath(_ r: Rect, grow g: CGFloat = 0) -> Path {
    Path(CGRect(x: r.x - g, y: r.y - g, width: r.w + 2 * g, height: r.h + 2 * g))
}
private func circPath(_ c: Circ, grow g: CGFloat = 0) -> Path {
    Path(ellipseIn: CGRect(x: c.x - c.r - g, y: c.y - c.r - g, width: 2 * (c.r + g), height: 2 * (c.r + g)))
}
private func hazardPath(_ z: Hazard, grow g: CGFloat = 0) -> Path {
    if let c = z.circ { return circPath(c, grow: g) }
    return shapePath(z.rect!, grow: g)
}

func drawCourse(_ ctx: inout GraphicsContext, _ course: Course, hole h: Hole) {
    var c = ctx
    c.fill(Path(CGRect(x: 0, y: 0, width: W, height: H)), with: .color(course.rough))

    // Fairway: outline pass first so overlapping strips share one outline.
    var fairOutline = Path(); for r in h.fair { fairOutline.addPath(shapePath(r, grow: 4)) }
    c.fill(fairOutline, with: .color(INK))
    var fair = Path(); for r in h.fair { fair.addPath(shapePath(r)) }
    c.fill(fair, with: .color(course.fair))

    // Green around the cup
    let cup = CGPoint(x: h.cup.x, y: h.cup.y)
    c.fill(Path(ellipseIn: CGRect(x: cup.x - GREEN_R - 4, y: cup.y - GREEN_R - 4, width: 2 * (GREEN_R + 4), height: 2 * (GREEN_R + 4))), with: .color(INK))
    c.fill(Path(ellipseIn: CGRect(x: cup.x - GREEN_R, y: cup.y - GREEN_R, width: 2 * GREEN_R, height: 2 * GREEN_R)), with: .color(course.green))

    // Tee box
    let tee = CGRect(x: h.tee.x - 14, y: h.tee.y - 6, width: 28, height: 12)
    c.fill(Path(tee), with: .color(Color(hex: 0xc4f49a)))
    c.stroke(Path(tee), with: .color(INK), lineWidth: 2)

    // Hazards
    for z in h.haz {
        c.fill(hazardPath(z, grow: 4), with: .color(INK))
        var inner = c
        inner.clip(to: hazardPath(z))
        inner.fill(hazardPath(z), with: .color(HAZ_COLOR[z.t] ?? .gray))
        if z.t == "water" {
            for i in 0..<3 { for j in 0..<3 {
                let b = hazardBounds(z)
                let px = b.minX + (CGFloat(i) + 0.5) * b.width / 3
                let py = b.minY + (CGFloat(j) + 0.5) * b.height / 3
                var arc = Path()
                arc.addArc(center: CGPoint(x: px, y: py), radius: 3, startAngle: .radians(0.2), endAngle: .radians(Double.pi - 0.2), clockwise: false)
                inner.stroke(arc, with: .color(.white.opacity(0.7)), lineWidth: 2)
            } }
        } else {
            let b = hazardBounds(z)
            for i in 0..<16 {
                let px = b.minX + CGFloat((i * 37) % 100) / 100 * b.width
                let py = b.minY + CGFloat((i * 53) % 100) / 100 * b.height
                inner.fill(Path(CGRect(x: px, y: py, width: 2, height: 2)), with: .color(Color(hex: 0xd9b96a)))
            }
        }
    }

    // Walls
    var wallOutline = Path(); for r in h.walls { wallOutline.addPath(shapePath(r, grow: 4)) }
    c.fill(wallOutline, with: .color(INK))
    var wallFill = Path(); for r in h.walls { wallFill.addPath(shapePath(r)) }
    c.fill(wallFill, with: .color(course.walls))

    // Trees, seen from above
    for t in h.trees {
        c.fill(Path(ellipseIn: CGRect(x: t.x + 4 - t.r - 1, y: t.y + 5 - t.r - 1, width: 2 * (t.r + 1), height: 2 * (t.r + 1))), with: .color(.black.opacity(0.18)))
        c.fill(circPath(t), with: .color(Color(hex: 0x2f8f3a)))
        c.stroke(circPath(t), with: .color(INK), lineWidth: 3)
        let hl = Circ(x: t.x - t.r * 0.3, y: t.y - t.r * 0.3, r: t.r * 0.35)
        c.fill(circPath(hl), with: .color(Color(hex: 0x6fd17a)))
    }

    // Cup and flag
    c.fill(Path(ellipseIn: CGRect(x: cup.x - CUP_R - 2, y: cup.y - CUP_R - 2, width: 2 * (CUP_R + 2), height: 2 * (CUP_R + 2))), with: .color(INK))
    c.fill(Path(ellipseIn: CGRect(x: cup.x - CUP_R, y: cup.y - CUP_R, width: 2 * CUP_R, height: 2 * CUP_R)), with: .color(Color(hex: 0x111111)))
    var pole = Path(); pole.move(to: cup); pole.addLine(to: CGPoint(x: cup.x, y: cup.y - 40))
    c.stroke(pole, with: .color(.white), lineWidth: 2.5)
    var flag = Path()
    flag.move(to: CGPoint(x: cup.x, y: cup.y - 40)); flag.addLine(to: CGPoint(x: cup.x + 18, y: cup.y - 34)); flag.addLine(to: CGPoint(x: cup.x, y: cup.y - 28)); flag.closeSubpath()
    c.fill(flag, with: .color(Color(hex: 0xff5964)))
    c.stroke(flag, with: .color(INK), lineWidth: 1.5)
    ctx = c
}

func hazardBounds(_ z: Hazard) -> CGRect {
    if let c = z.circ { return CGRect(x: c.x - c.r, y: c.y - c.r, width: 2 * c.r, height: 2 * c.r) }
    let r = z.rect!
    return CGRect(x: r.x, y: r.y, width: r.w, height: r.h)
}
