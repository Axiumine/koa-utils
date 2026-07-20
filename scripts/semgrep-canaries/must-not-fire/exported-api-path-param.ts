// safe HERE by deliberate scoping, not by accident. The abandoned "any function
// parameter is a source" model produced 7 permanently-accepted findings, all on this
// package's exported public API. This fixture fails the run if that model returns:
// consumer misuse of the public API is documented caller responsibility, and
// assertNoTraversal is the runtime guard at that boundary.
import fs from 'fs-extra'
export async function moveTempFile(from: string, to: string) {
	await fs.move(from, to)
}
export const reEncodeTo = async (filePath: string) => {
	await fs.readFile(filePath)
}
