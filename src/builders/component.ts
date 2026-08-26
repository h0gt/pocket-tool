import { Collection } from '@discordjs/collection';
import type { Component } from '../types/types';

export const components = new Collection<string, Component>();

export default function createComponent<Args extends readonly string[] = readonly string[]>(
  component: Component<Args>,
): void {
  components.set(component.customId, component);
}
