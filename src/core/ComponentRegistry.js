/**
 * ComponentRegistry allows registering new component types dynamically,
 * enabling external mods and easier extensibility.
 */

class ComponentRegistry {
  constructor() {
    this.models = new Map();
  }

  register(model) {
    if (!model.type) throw new Error("Component model must have a 'type'");
    this.models.set(model.type, model);
  }

  get(type) {
    return this.models.get(type);
  }

  getAll() {
    return Array.from(this.models.values());
  }
}

export const registry = new ComponentRegistry();
