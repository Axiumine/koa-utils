// VULNERABLE (with -b-sink.ts), currently silent.
// Half one: reads untrusted input and hands it across a module boundary.
import { storePath } from './crossfile-taint-b-sink'
export async function handler(ctx: any) {
	const name = ctx.params.name
	await storePath(name)
}
