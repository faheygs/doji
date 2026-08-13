const MAX_EVENT_IDS = 500;

export class RealtimeEventDeduper {
  private readonly ids = new Set<string>();
  private readonly order: string[] = [];

  shouldProcess(eventId: string | undefined): boolean {
    if (!eventId) return true;
    if (this.ids.has(eventId)) return false;
    this.ids.add(eventId);
    this.order.push(eventId);
    if (this.order.length > MAX_EVENT_IDS) {
      const oldest = this.order.shift();
      if (oldest) this.ids.delete(oldest);
    }
    return true;
  }

  clear(): void {
    this.ids.clear();
    this.order.length = 0;
  }
}
