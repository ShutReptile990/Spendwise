/** Keeps successful results and shares a request while it is in flight. */
export class RequestCache<Key, Value> {
  private values = new Map<Key, Value>();
  private pending = new Map<Key, Promise<Value>>();

  getCached(key: Key): Value | undefined {
    return this.values.get(key);
  }

  get(key: Key, load: () => Promise<Value>, refresh = false): Promise<Value> {
    const pending = this.pending.get(key);
    if (pending) return pending;
    if (!refresh && this.values.has(key)) return Promise.resolve(this.values.get(key)!);

    const request = Promise.resolve().then(load).then((value) => {
      this.values.set(key, value);
      return value;
    }).finally(() => {
      this.pending.delete(key);
    });
    this.pending.set(key, request);
    return request;
  }
}
