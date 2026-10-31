# Verifying a release

Independent checks are available for the releases of `@axiumine/koa-utils`:

1. the git tag for the version is signed by the maintainer (every tag from `v5.0.0` on),
2. the tarball on npm can be rebuilt from that tag, byte for byte (checked for `7.1.0`, section 2), and
3. the tarball of a release published by the GitHub Actions release workflow is covered by a signed build attestation (section 4 says which releases that is).

Together they let you confirm that what npm served you is what the maintainer tagged.

## 1. The signed tag

Every release tag from `v5.0.0` on is an SSH-signed annotated tag; GitHub reports each of them as verified. The older `v3.7.3` tag carries a signature block that does not verify, so treat it as unsigned.

| | |
|---|---|
| Signer | Giovanni Manzoni, dev@giovannimanzoni.com |
| Key type | RSA |
| Fingerprint | `SHA256:O+VNPvKOWi5ZrSvzs4gNBjAa9PeHvj7KlvoSDZJ25EQ` |
| Where to get the public key | The maintainer's GitHub account lists it as an SSH signing key: <https://api.github.com/users/giovannimanzoni/ssh_signing_keys> |

GitHub shows a "Verified" badge on a correctly signed tag. To check it yourself:

```bash
# 1. Fetch the public signing key GitHub holds for the maintainer.
curl -fsSL https://api.github.com/users/giovannimanzoni/ssh_signing_keys \
  | jq -r '.[] | "dev@giovannimanzoni.com " + .key' > allowed_signers

# 2. Confirm it is the key named on this page.
ssh-keygen -lf <(cut -d' ' -f2- allowed_signers)
#    expected: ... SHA256:O+VNPvKOWi5ZrSvzs4gNBjAa9PeHvj7KlvoSDZJ25EQ ... (RSA)

# 3. Verify the tag you installed.
git clone https://github.com/Axiumine/koa-utils.git
cd koa-utils
git -c gpg.format=ssh -c gpg.ssh.allowedSignersFile=../allowed_signers tag -v v7.1.0
#    expected: Good "git" signature for dev@giovannimanzoni.com with RSA key SHA256:O+VN...
```

If the fingerprint in step 2 differs from the one above, stop and open an issue.

## 2. The tarball matches the tag

The build is deterministic. From a clean checkout of the tag, with the dependencies fixed by `yarn.lock`, the packed tarball has the same SHA-1 as the one published on npm.

```bash
git clone https://github.com/Axiumine/koa-utils.git && cd koa-utils
git checkout v7.1.0
yarn install --frozen-lockfile --ignore-scripts
yarn build
npm pack --ignore-scripts          # writes axiumine-koa-utils-7.1.0.tgz
shasum axiumine-koa-utils-7.1.0.tgz
npm view @axiumine/koa-utils@7.1.0 dist.shasum --registry=https://registry.npmjs.org/
```

The two hashes must be equal. For `7.1.0` both are `929095345ef34839854802bed6b17c8040c99d7d`; this was checked on 2026-10-30 with Node.js 24.18, Yarn 1.22 and npm 12. Node.js 24 and Yarn 1 are what `package.json` and [CONTRIBUTING.md](../CONTRIBUTING.md) ask for; other toolchains are not covered by the promise. Only 7.1.0 has been checked this way, and CI checks on every change that two clean builds are byte-identical.

## 3. Registry signatures

`npm audit signatures` checks that the tarball in your `node_modules` carries a valid signature from the npm registry. That proves the registry served it unmodified; it does not by itself prove who built it, which is what sections 1 and 2 are for.

## 4. The build attestation

Releases published through `.github/workflows/release.yml` carry two assets on the GitHub release: the tarball `axiumine-koa-utils-X.Y.Z.tgz` and `axiumine-koa-utils-X.Y.Z.tgz.intoto.jsonl`, a Sigstore bundle holding a SLSA provenance statement for that tarball. The bundle is signed keylessly by the workflow run: there is no long-lived signing key to hold or rotate. `gh attestation verify` checks the signature, and with `--signer-workflow` it also pins the workflow file that made it. The workflow also publishes the same tarball to npm with an npm provenance statement.

The commands below use `7.1.1`; replace it with the version you installed.

```bash
gh release download v7.1.1 --repo Axiumine/koa-utils -p '*.tgz' -p '*.intoto.jsonl'
gh attestation verify axiumine-koa-utils-7.1.1.tgz --bundle axiumine-koa-utils-7.1.1.tgz.intoto.jsonl \
  --repo Axiumine/koa-utils --signer-workflow Axiumine/koa-utils/.github/workflows/release.yml
npm audit signatures
```

`gh attestation verify` exits 0 when the bundle is valid for that exact file and was produced by `.github/workflows/release.yml` of the `Axiumine/koa-utils` repository (`--repo` alone checks only the repository; a bundle from another workflow of the same repository fails with `--signer-workflow`). For `7.1.1` the signer is `release.yml@refs/tags/v7.1.1`, the predicate type is `https://slsa.dev/provenance/v1`, and the tarball's SHA-1 (`abe72fc251b2001eac9e4ca9e2ae5a93b3426041`) is the same as `npm view @axiumine/koa-utils@7.1.1 dist.shasum` reports.

`7.1.1` is the first release published through the workflow ([run 41154050633](https://github.com/Axiumine/koa-utils/actions/runs/41154050633)). Versions up to and including `7.1.0` were not published through the workflow and have no tarball attestation. For them use sections 1 and 2: tags from `v5.0.0` on are signed (section 1), while versions before that have no signed tag, and `7.1.0` is the only version whose tarball was rebuilt byte for byte (section 2). A later version published by hand with `yarn upload` also has no attestation.

## When the signing key changes

The key above is replaced only by a commit to this page that is itself made with a key already listed here, or, if the maintainer is lost, by a successor named in [GOVERNANCE.md](../GOVERNANCE.md#continuity) who records their own fingerprint here in the same commit as the first tag they sign. Tags signed with an earlier key stay valid with that key. Keep a history of fingerprints in this table:

| Valid for tags | Fingerprint |
|---|---|
| `v5.0.0` and later | `SHA256:O+VNPvKOWi5ZrSvzs4gNBjAa9PeHvj7KlvoSDZJ25EQ` |
