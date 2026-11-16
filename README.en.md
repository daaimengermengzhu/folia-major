# Folia DualScreen

An unofficial Windows multi-monitor edition of [Folia](https://github.com/chthollyphile/folia-major).
[简体中文](README.md) · [Original feature overview](README.upstream.en.md)

The opt-in wallpaper policy moves lyrics to a nearby secondary display when the primary display
has a maximized or fullscreen work window, and returns when it becomes free. Partial windows do
not trigger it. Relocation preserves the same renderer/audio session and supports portrait monitors.

**Version 0.7.28-dualscreen.1 is a source preview. No community installer is published yet.**
Upstream PR #1241 was closed because the feature is outside upstream's plans. Report issues in
this fork, not to the original maintainer. See the Chinese README for the verified Windows source
commands and [community notes](docs/dualscreen-community.md) for scope and limitations.

This edition has a distinct product name and application ID. Its updater is disabled during the
source preview so upstream installers cannot replace it. Existing upstream credentials and settings
are not automatically migrated. No music, membership, account, or API key is bundled.

Original authorship, contributor credits and third-party notices are preserved. This derivative
remains under [AGPL-3.0](LICENSE); distribute matching source and build instructions with binaries.
