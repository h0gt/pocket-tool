import { components } from '../bot';
import type { Component } from '../types/types';

export default function createComponent<Args extends readonly string[] = readonly string[]>(
  component: Component<Args>,
): void {
  components.set(component.customId, component);
}
