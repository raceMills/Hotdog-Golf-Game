import SwiftUI

// Course layouts, ported from the web prototype. Changing any number here changes
// every existing share code's replay, so treat these as frozen once shipped.

struct Course {
    let name: String
    let blurb: String
    let rough: Color, fair: Color, green: Color, walls: Color
    let holes: [Hole]
}

private func rect(_ x: Double, _ y: Double, _ w: Double, _ h: Double) -> Rect { Rect(x: x, y: y, w: w, h: h) }
private func sand(_ x: Double, _ y: Double, _ w: Double, _ h: Double) -> Hazard { Hazard(t: "sand", rect: rect(x, y, w, h), circ: nil) }
private func waterR(_ x: Double, _ y: Double, _ w: Double, _ h: Double) -> Hazard { Hazard(t: "water", rect: rect(x, y, w, h), circ: nil) }
private func waterC(_ x: Double, _ y: Double, _ r: Double) -> Hazard { Hazard(t: "water", rect: nil, circ: Circ(x: x, y: y, r: r)) }
private func tree(_ x: Double, _ y: Double, _ r: Double) -> Circ { Circ(x: x, y: y, r: r) }

let COURSES: [Course] = [
    Course(name: "Sunny Meadows", blurb: "Wide fairways, friendly bunkers",
           rough: Color(hex: 0x58b04a), fair: Color(hex: 0x9be46f), green: Color(hex: 0xc4f49a), walls: Color(hex: 0xb5764a),
           holes: [
            Hole(par: 3, tee: V(x: 180, y: 520), cup: V(x: 180, y: 90), fair: [rect(120, 60, 120, 500)],
                 haz: [sand(236, 250, 52, 38)], walls: [], trees: [tree(130, 330, 13), tree(232, 170, 13)]),
            Hole(par: 4, tee: V(x: 150, y: 520), cup: V(x: 250, y: 110),
                 fair: [rect(110, 300, 140, 260), rect(160, 60, 140, 260)],
                 haz: [waterC(190, 380, 30)], walls: [], trees: [tree(275, 200, 13)]),
            Hole(par: 5, tee: V(x: 180, y: 520), cup: V(x: 190, y: 80), fair: [rect(100, 60, 170, 500)],
                 haz: [sand(100, 180, 40, 90), waterC(250, 300, 26)], walls: [], trees: [tree(240, 420, 13)]),
           ]),
    Course(name: "Sandy Dunes", blurb: "Bunkers everywhere",
           rough: Color(hex: 0xe9c46a), fair: Color(hex: 0x9ad65f), green: Color(hex: 0xc8f08f), walls: Color(hex: 0xc0754a),
           holes: [
            Hole(par: 3, tee: V(x: 180, y: 520), cup: V(x: 180, y: 100), fair: [rect(120, 60, 120, 500)],
                 haz: [sand(110, 230, 30, 130), sand(220, 230, 30, 130)], walls: [rect(160, 330, 40, 14)], trees: []),
            Hole(par: 4, tee: V(x: 120, y: 520), cup: V(x: 260, y: 90),
                 fair: [rect(90, 260, 150, 300), rect(190, 80, 120, 200)],
                 haz: [sand(90, 150, 70, 110), sand(240, 300, 50, 60)], walls: [], trees: [tree(200, 210, 12)]),
            Hole(par: 4, tee: V(x: 180, y: 520), cup: V(x: 180, y: 70), fair: [rect(130, 60, 100, 500)],
                 haz: [sand(70, 200, 60, 50), sand(230, 200, 60, 50), sand(140, 130, 80, 40)],
                 walls: [rect(150, 400, 12, 50)], trees: []),
           ]),
    Course(name: "Pirate Cove", blurb: "Water hazards and rocks",
           rough: Color(hex: 0x3a9d5d), fair: Color(hex: 0x7fcf6a), green: Color(hex: 0xb6f08a), walls: Color(hex: 0x8b5a2b),
           holes: [
            Hole(par: 3, tee: V(x: 180, y: 520), cup: V(x: 180, y: 100), fair: [rect(130, 60, 100, 500)],
                 haz: [waterR(130, 250, 60, 50)], walls: [rect(230, 300, 12, 120)], trees: []),
            Hole(par: 4, tee: V(x: 150, y: 520), cup: V(x: 240, y: 90),
                 fair: [rect(100, 280, 160, 280), rect(170, 70, 120, 230)],
                 haz: [waterC(250, 380, 34), waterR(100, 150, 50, 80)],
                 walls: [rect(200, 200, 12, 80)], trees: [tree(140, 400, 12)]),
            Hole(par: 5, tee: V(x: 180, y: 520), cup: V(x: 180, y: 80), fair: [rect(110, 60, 140, 500)],
                 haz: [waterC(120, 300, 30), waterC(240, 230, 28)],
                 walls: [rect(150, 160, 60, 12), rect(150, 400, 12, 80)], trees: [tree(200, 340, 12)]),
           ]),
]

extension Color {
    init(hex: UInt32) {
        self.init(red: Double((hex >> 16) & 0xff) / 255, green: Double((hex >> 8) & 0xff) / 255, blue: Double(hex & 0xff) / 255)
    }
}

func parOf(_ ci: Int) -> Int { COURSES[ci].holes.reduce(0) { $0 + $1.par } }
