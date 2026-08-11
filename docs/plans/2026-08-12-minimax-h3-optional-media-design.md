# MiniMax H3 Optional Media References

## Contract

MiniMax H3 `media` mode accepts up to five image references and up to three audio references. Both
groups are optional, so image-only, audio-only, combined image/audio, and prompt-only requests are
valid. Video references remain unsupported. The independent `images` mode still requires at least
one image, while `frame` keeps its existing ordered start/end-frame behavior.

Native output audio remains mandatory for MiniMax H3. This output setting is independent from
whether the caller supplies reference audio.

## Implementation

Infinite Canvas removes the artificial minimum image and audio counts from the H3 `media`
capability. Leonardo2API removes the matching local combination check. Both layers retain the
static maximum counts and continue to apply the active Leonardo Release schema when it advertises
stricter limits. Payload construction remains unchanged and emits only the guidance groups that
have actual references.

## Verification

Capability tests cover image-only and audio-only `media` selections while preserving the mandatory
output-audio rule. Leonardo2API validation tests cover each optional reference group independently,
their combined form, and the existing rejection of audio references in `frame` and `images` modes.
