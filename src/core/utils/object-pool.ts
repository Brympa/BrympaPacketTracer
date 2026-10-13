/**
 * Generic Object Pool for minimizing Garbage Collection overhead during high packet traffic.
 */

export class ObjectPool<T> {
  private pool: T[] = [];
  private readonly factory: () => T;
  private readonly resetFn?: (item: T) => void;
  private readonly maxCapacity: number;

  constructor(factory: () => T, resetFn?: (item: T) => void, maxCapacity = 5000) {
    this.factory = factory;
    this.resetFn = resetFn;
    this.maxCapacity = maxCapacity;
  }

  public acquire(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return this.factory();
  }

  public release(item: T): void {
    if (this.resetFn) {
      this.resetFn(item);
    }
    if (this.pool.length < this.maxCapacity) {
      this.pool.push(item);
    }
  }

  public size(): number {
    return this.pool.length;
  }

  public clear(): void {
    this.pool = [];
  }
}
