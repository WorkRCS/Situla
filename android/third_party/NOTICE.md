# Third-party ad-blocking components

Situla Android uses Brave's `adblock-rust` engine through the Kotlin/JNI bridge published as
`io.github.mlm-games:adblock:0.1.3`.

Upstream bridge: https://github.com/mlm-games/adblock-rs-kt-wrapper (release 0.1.3)
Upstream engine: https://github.com/brave/adblock-rust
Licenses: Mozilla Public License 2.0 (MPL-2.0)

The two Kotlin bridge source files under `android/app/src/main/java/org/mlm/adblock/`
are copied from the 0.1.3 bridge release so the app can compile the wrapper sources with
its own Android SDK configuration. The AAR is resolved as a raw archive solely to extract
its prebuilt JNI libraries and bundled `resources.json`; it is not added as an Android
compile dependency, avoiding its upstream minCompileSdk 37 metadata requirement.

The engine and JNI bridge remain third-party components. Situla does not claim to be Brave
Browser or a full implementation of Brave Shields.
