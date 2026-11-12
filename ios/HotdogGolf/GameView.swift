import SwiftUI

// The course screen: draws the hole, takes drag-to-aim input, shows the HUD.

struct GameView: View {
    @StateObject var engine: RoundEngine
    var onExit: () -> Void
    var onFinish: (FinishedRound) -> Void

    var body: some View {
        GeometryReader { geo in
            let fit = fitTransform(in: geo.size)
            ZStack {
                Canvas { ctx, size in
                    var c = ctx
                    c.concatenate(fit)
                    drawBoard(&c)
                }
                .contentShape(Rectangle())
                .gesture(aimGesture(fit: fit))

                hud
                if let n = engine.summaryHole { summaryCard(n) }
            }
            .background(Color(hex: 0x9be7ff))
            .onChange(of: engine.finished?.scores) { _ in
                if let f = engine.finished, !engine.isReplay { onFinish(f) }
            }
        }
        .ignoresSafeArea()
    }

    // World (360x600) fitted into the screen, centred.
    private func fitTransform(in size: CGSize) -> CGAffineTransform {
        let s = min(size.width / W, size.height / H)
        let ox = (size.width - W * s) / 2, oy = (size.height - H * s) / 2
        return CGAffineTransform(a: s, b: 0, c: 0, d: s, tx: ox, ty: oy)
    }

    private func aimGesture(fit: CGAffineTransform) -> some Gesture {
        DragGesture(minimumDistance: 0, coordinateSpace: .local)
            .onChanged { value in
                let p = value.location.applying(fit.inverted())
                engine.dragChanged(to: V(x: Double(p.x), y: Double(p.y)))
            }
            .onEnded { _ in engine.dragEnded() }
    }

    private func drawBoard(_ c: inout GraphicsContext) {
        let h = engine.hole
        drawCourse(&c, engine.course, hole: h)

        // Predicted path while aiming
        if engine.dragFrom != nil, let pv = engine.preview {
            let color: Color = pv.pen ? Color(hex: 0xff5964) : .white
            for i in stride(from: 3, to: pv.path.count, by: 4) {
                let p = pv.path[i]
                c.fill(Path(ellipseIn: CGRect(x: p.x - 2, y: p.y - 2, width: 4, height: 4)), with: .color(color))
            }
            c.stroke(Path(ellipseIn: CGRect(x: pv.x - 6, y: pv.y - 6, width: 12, height: 12)), with: .color(.white), lineWidth: 2)
        }

        // Balls and golfers
        for (i, g) in engine.golfers.enumerated() where i < engine.balls.count {
            let b = engine.balls[i]
            if b.sunk { continue }
            var pos = b.pos
            if let a = engine.anim, a.ball == i {
                let k = min(Int(a.i), a.pts.count - 1)
                pos = a.pts[k]
            }
            drawHotdog(&c, g, at: CGPoint(x: pos.x - 18, y: pos.y - 8), scale: 0.7)
            c.fill(Path(ellipseIn: CGRect(x: pos.x + 1.5 - BR, y: pos.y + 2 - BR, width: 2 * BR, height: 2 * BR)), with: .color(.black.opacity(0.25)))
            let ball = Path(ellipseIn: CGRect(x: pos.x - BR, y: pos.y - BR, width: 2 * BR, height: 2 * BR))
            c.fill(ball, with: .color(.white))
            c.stroke(ball, with: .color(INK), lineWidth: 1.5)
            if i == engine.turn, engine.anim == nil, !b.done, !engine.isReplay {
                c.stroke(Path(ellipseIn: CGRect(x: pos.x - BR - 5, y: pos.y - BR - 5, width: 2 * (BR + 5), height: 2 * (BR + 5))),
                         with: .color(Color(hex: 0xffd23f)), style: StrokeStyle(lineWidth: 2.5, dash: [3, 3]))
            }
        }

        // Aim line from the ball to the pointer
        if let from = engine.dragFrom, engine.turn < engine.balls.count {
            let b = engine.balls[engine.turn]
            var line = Path(); line.move(to: CGPoint(x: b.pos.x, y: b.pos.y)); line.addLine(to: CGPoint(x: from.x, y: from.y))
            c.stroke(line, with: .color(INK), style: StrokeStyle(lineWidth: 3, dash: [6, 6]))
        }
    }

    private var hud: some View {
        VStack {
            HStack {
                Text(holeLabel)
                    .font(.system(size: 15, weight: .heavy, design: .rounded))
                    .padding(.horizontal, 10).padding(.vertical, 6)
                    .background(Color(hex: 0xfff8e7), in: RoundedRectangle(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(INK, lineWidth: 3))
                Spacer()
                Button(action: onExit) {
                    Text("✕ Quit").font(.system(size: 15, weight: .heavy, design: .rounded))
                        .padding(.horizontal, 10).padding(.vertical, 6)
                        .background(Color(hex: 0xfff8e7), in: RoundedRectangle(cornerRadius: 14))
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(INK, lineWidth: 3))
                }
            }
            .padding(.horizontal, 12).padding(.top, 52)

            Text(turnLabel)
                .font(.system(size: 15, weight: .heavy, design: .rounded))
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(Color(hex: 0xfff8e7), in: Capsule())
                .overlay(Capsule().stroke(INK, lineWidth: 3))

            Spacer()

            if !engine.isReplay {
                Text("Drag back to aim and power, release to shoot")
                    .font(.system(size: 13, weight: .semibold, design: .rounded))
                    .padding(.horizontal, 10).padding(.vertical, 4)
                    .background(Color(hex: 0xfff8e7), in: Capsule())
                    .overlay(Capsule().stroke(INK, lineWidth: 2))
            }

            powerBar.padding(.horizontal, 14).padding(.bottom, 24)
        }
        .allowsHitTesting(true)
    }

    private var powerBar: some View {
        let frac = engine.dragVec.map { min(1, $0.m / MAXV) } ?? 0
        return GeometryReader { g in
            ZStack(alignment: .leading) {
                Color(hex: 0xfff8e7)
                LinearGradient(colors: [Color(hex: 0x7ae582), Color(hex: 0xffd23f), Color(hex: 0xff5964)],
                               startPoint: .leading, endPoint: .trailing)
                    .frame(width: g.size.width * frac)
            }
        }
        .frame(height: 20)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(INK, lineWidth: 3))
    }

    private var holeLabel: String {
        "Hole \(engine.holeIndex + 1)/\(engine.course.holes.count) · Par \(engine.hole.par)"
    }

    private var turnLabel: String {
        guard let g = engine.currentGolfer, engine.turn < engine.balls.count else { return "" }
        if engine.isReplay { return "Replaying \(g.name)" }
        let s = engine.balls[engine.turn].strokes
        return "\(g.name)'s turn · \(s) stroke\(s == 1 ? "" : "s")"
    }

    private func summaryCard(_ idx: Int) -> some View {
        let h = engine.course.holes[idx]
        return VStack(spacing: 10) {
            Text("Hole \(idx + 1) done!").font(.system(size: 26, weight: .heavy, design: .rounded))
            Text("Par \(h.par)")
            ForEach(Array(engine.golfers.enumerated()), id: \.offset) { i, g in
                let s = engine.holeStrokesOf(golfer: i, hole: idx)
                HStack {
                    Text(g.name).bold()
                    Spacer()
                    Text("\(s)")
                    Text(scoreName(s, h.par)).frame(width: 110, alignment: .trailing)
                }
            }
            Button("Next Hole ▶") { engine.nextHole() }
                .font(.system(size: 20, weight: .heavy, design: .rounded))
                .padding(.vertical, 12).frame(maxWidth: .infinity)
                .background(Color(hex: 0xffd23f), in: RoundedRectangle(cornerRadius: 18))
                .overlay(RoundedRectangle(cornerRadius: 18).stroke(INK, lineWidth: 4))
        }
        .padding(20)
        .background(Color(hex: 0xfff8e7), in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).stroke(INK, lineWidth: 4))
        .padding(30)
        .background(Color.black.opacity(0.45))
    }
}

func scoreName(_ s: Int, _ p: Int) -> String {
    let d = s - p
    if s == 1 { return "Hole in one!" }
    if d <= -2 { return "Eagle" }
    if d == -1 { return "Birdie" }
    if d == 0 { return "Par" }
    if d == 1 { return "Bogey" }
    if d == 2 { return "Double bogey" }
    return "+\(d)"
}
