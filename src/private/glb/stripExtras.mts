import type { Document, Property } from '@gltf-transform/core'

/**
 * Empty the `extras` of the root and of every property in the graph: scenes, nodes, meshes, primitives, accessors,
 * materials, texture infos, animations, skins, cameras, buffers and the extension properties. `extras` is free-form
 * JSON that tools and users fill with anything. The writer only reaches a property through the edge of its parent, so
 * the children of the edges, plus the root, are every property that is written.
 */
export function stripExtras(document: Document): void {
	const properties = new Set<Property>([document.getRoot()])
	for (const edge of document.getGraph().listEdges()) {
		properties.add(edge.getChild())
	}
	for (const property of properties) {
		property.setExtras({})
	}
}
