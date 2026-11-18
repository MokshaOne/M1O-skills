/**
 * M10 Plugin Hook System
 * WordPress-style actions & filters for the CMS core.
 */

class HookRegistry {
  constructor() {
    /** @type {Map<string, Array<{fn: Function, priority: number}>>} */
    this.hooks = new Map();
  }

  /**
   * Register a hook handler.
   * @param {string} event - e.g. 'content.beforeCreate', 'media.afterUpload'
   * @param {Function} fn - Handler function
   * @param {number} [priority=10] - Lower runs first
   */
  on(event, fn, priority = 10) {
    if (!this.hooks.has(event)) this.hooks.set(event, []);
    const handlers = this.hooks.get(event);
    handlers.push({ fn, priority });
    handlers.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Run all handlers for an event (action-style, side effects).
   * @param {string} event
   * @param  {...any} args
   */
  async run(event, ...args) {
    const handlers = this.hooks.get(event) || [];
    for (const { fn } of handlers) {
      await fn(...args);
    }
  }

  /**
   * Run handlers as a filter chain — each handler receives and returns the value.
   * @param {string} event
   * @param {any} value - The value to filter
   * @param  {...any} args - Additional context
   * @returns {Promise<any>} Filtered value
   */
  async filter(event, value, ...args) {
    const handlers = this.hooks.get(event) || [];
    let result = value;
    for (const { fn } of handlers) {
      result = await fn(result, ...args);
    }
    return result;
  }
}

export const hooks = new HookRegistry();
export default hooks;
