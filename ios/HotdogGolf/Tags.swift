import Foundation

// Hotdog Golf tags. Tag 1 is the best. New golfers join last.
// After a round, the tag numbers held by the golfers who played are handed out by
// finishing place. Ties keep the better current tag ahead.

func nextTag(after golfers: [Golfer]) -> Int {
    (golfers.map(\.tag).max() ?? 0) + 1
}

func shuffledTags(count: Int) -> [Int] {
    var nums = count > 0 ? Array(1...count) : []
    nums.shuffle()
    return nums
}

// results: (id, score) for everyone who played. Returns new tag per golfer id.
func reassignTags(golfers: [Golfer], results: [(id: String, score: Int)]) -> [String: Int] {
    let byId = Dictionary(uniqueKeysWithValues: golfers.map { ($0.id, $0) })
    let pool = results.compactMap { byId[$0.id]?.tag }.sorted()
    let order = results.sorted { a, b in
        if a.score != b.score { return a.score < b.score }
        return (byId[a.id]?.tag ?? 0) < (byId[b.id]?.tag ?? 0)
    }
    var out: [String: Int] = [:]
    for (i, r) in order.enumerated() where i < pool.count { out[r.id] = pool[i] }
    return out
}

func tagOrder(_ golfers: [Golfer]) -> [Golfer] {
    golfers.sorted { $0.tag < $1.tag }
}
