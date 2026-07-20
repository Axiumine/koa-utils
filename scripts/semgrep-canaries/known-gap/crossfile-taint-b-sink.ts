// VULNERABLE (with -a-source.ts), currently silent.
// Half two: the filesystem sink, in a different file from the source.
// Semgrep OSS taint is intra-file only, so the two halves are never linked.
// This is the shape of the real instances noted on the redis rule
// (logout.mts:22, refresh.mts:52), which launder the value through ctx.state.
import fs from 'fs-extra'
export async function storePath(name: string) {
	await fs.writeFile('/var/data/' + name, 'x')
}
