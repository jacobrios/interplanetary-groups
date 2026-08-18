import { describe, it, expect } from "vitest"
import {
  consensusFloor,
  incumbentCount,
  hasConsensus,
} from "../consensus"

const input = (
  yes: string[],
  keep: string[],
  currentIn: string[],
  memberCount: number
) => ({ yesVoterIds: yes, keepVoterIds: keep, currentInUserIds: currentIn, memberCount })

describe("consensusFloor", () => {
  it("is three for groups of three or more", () => {
    expect(consensusFloor(3)).toBe(3)
    expect(consensusFloor(8)).toBe(3)
  })
  it("is the whole group below three", () => {
    expect(consensusFloor(2)).toBe(2)
    expect(consensusFloor(1)).toBe(1)
  })
  it("never drops below one", () => {
    expect(consensusFloor(0)).toBe(1)
  })
})

describe("incumbentCount: yeses switch sides", () => {
  it("counts current INs who have not said yes", () => {
    expect(incumbentCount(input(["a"], [], ["a", "b", "c"], 5))).toBe(2)
  })
  it("counts keep voters on the incumbent side", () => {
    expect(incumbentCount(input([], ["d"], ["a"], 5))).toBe(2)
  })
  it("never double-counts a keep voter who is also IN", () => {
    expect(incumbentCount(input([], ["a"], ["a"], 5))).toBe(1)
  })
  it("a yes beats a stale IN, whole side can empty", () => {
    expect(incumbentCount(input(["a", "b", "c"], [], ["a", "b", "c"], 3))).toBe(0)
  })
})

describe("hasConsensus", () => {
  it("the seed's deadlock: three-person group, all in, all yes, moves", () => {
    expect(hasConsensus(input(["a", "b", "c"], [], ["a", "b", "c"], 3))).toBe(true)
  })
  it("five-person group, four in, three yes (one a switcher plus asker), moves", () => {
    // asker a (was IN) + b (was IN) + e (no RSVP) = 3 yes; incumbent c,d remain
    expect(hasConsensus(input(["a", "b", "e"], [], ["a", "b", "c", "d"], 5))).toBe(true)
  })
  it("one against four never clears the floor", () => {
    expect(hasConsensus(input(["a"], [], ["a", "b", "c", "d"], 5))).toBe(false)
  })
  it("duo: both yeses move it, one does not", () => {
    expect(hasConsensus(input(["a"], [], ["a", "b"], 2))).toBe(false)
    expect(hasConsensus(input(["a", "b"], [], ["a", "b"], 2))).toBe(true)
  })
  it("solo group moves on the asker's message alone (part one preserved)", () => {
    expect(hasConsensus(input(["a"], [], ["a"], 1))).toBe(true)
    expect(hasConsensus(input(["a"], [], [], 1))).toBe(true)
  })
  it("an undefended time still takes the floor", () => {
    expect(hasConsensus(input(["a", "b"], [], [], 5))).toBe(false)
    expect(hasConsensus(input(["a", "b", "c"], [], [], 5))).toBe(true)
  })
  it("keep taps can hold the line: 3 yes vs 3 keeps does not move", () => {
    expect(hasConsensus(input(["a", "b", "c"], ["d", "e", "f"], [], 8))).toBe(false)
  })
})

