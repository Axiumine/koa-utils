// safe here: a bare function parameter is not an attacker-reachable source.
// Guards the reachability-scoped source model against regressing to the old
// "any parameter is tainted" model that produced 7 unactionable findings.
import fs from 'fs-extra'
export async function moveTempFile(from: string, to: string) {
	await fs.move(from, to)
}
