/**
 * Monotonic integer nanosecond virtual clock for Discrete Event Simulation.
 * 1 second = 1_000_000_000n ns.
 * 1 millisecond = 1_000_000n ns.
 * 1 microsecond = 1_000n ns.
 */

export class VirtualClock {
  private currentNanoseconds = 0n;

  public now(): bigint {
    return this.currentNanoseconds;
  }

  public nowMs(): number {
    return Number(this.currentNanoseconds / 1_000_000n);
  }

  public advanceTo(target: bigint): void {
    if (target < this.currentNanoseconds) {
      throw new Error(
        `Cannot rewind virtual clock from ${this.currentNanoseconds}ns back to ${target}ns`
      );
    }
    this.currentNanoseconds = target;
  }

  public advanceBy(delta: bigint): void {
    if (delta < 0n) {
      throw new Error(`Cannot advance virtual clock by negative delta: ${delta}`);
    }
    this.currentNanoseconds += delta;
  }

  public reset(): void {
    this.currentNanoseconds = 0n;
  }
}
