import java.util.Properties

plugins {
    id("com.android.application")
    id("com.android.legacy-kapt")
    id("org.jetbrains.kotlin.plugin.compose")
}

val adblockJniLibs = layout.buildDirectory.dir("generated/adblock-jni")

val localProperties = Properties()
val localPropertiesFile = rootProject.file("local.properties")
if (localPropertiesFile.exists()) {
    localPropertiesFile.inputStream().use { localProperties.load(it) }
}
android {
    namespace = "com.workrcs.situla"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.workrcs.situla"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        manifestPlaceholders["situlaApiBaseUrl"] = localProperties.getProperty("situlaApiBaseUrl", "https://situla.vercel.app/")
    }
    buildFeatures { compose = true; buildConfig = false }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true
    }
    sourceSets.getByName("main").jniLibs.srcDir(adblockJniLibs.get().asFile)
    packaging { resources { excludes += setOf("/META-INF/AL2.0", "/META-INF/LGPL2.1") } }
}
kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}
dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2025.10.00")
    implementation(composeBom)
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.core:core-splashscreen:1.2.0")
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")
    implementation("com.wireguard.android:tunnel:1.0.20260102")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.4")
    implementation("androidx.lifecycle:lifecycle-process:2.9.4")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    debugImplementation("androidx.compose.ui:ui-tooling")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.google.code.gson:gson:2.11.0")
    implementation("io.coil-kt:coil-compose:2.7.0")
    implementation("androidx.room:room-runtime:2.8.5")
    implementation("androidx.room:room-ktx:2.8.5")
    kapt("androidx.room:room-compiler:2.8.5")
    implementation("androidx.media3:media3-exoplayer:1.9.0")
    implementation("androidx.media3:media3-exoplayer-hls:1.9.0")
    implementation("androidx.media3:media3-ui:1.9.0")
}


val nativeAbis = (findProperty("situlaAndroidAbis") as String?)
    ?.split(",")
    ?.map { it.trim() }
    ?.filter { it.isNotEmpty() }
    ?: listOf("x86_64") // Fast default for the standard Windows Android Emulator.

val cargoHomeDirectory = File(
    System.getenv("CARGO_HOME") ?: File(System.getProperty("user.home"), ".cargo").absolutePath
)
val cargoBinDirectory = File(cargoHomeDirectory, "bin")
val cargoSearchPath = listOf(cargoBinDirectory.absolutePath, System.getenv("PATH").orEmpty())
    .filter { it.isNotBlank() }
    .joinToString(File.pathSeparator)

val androidSdkDirectory = localProperties.getProperty("sdk.dir")
    ?.let { File(it) }
    ?: File(System.getenv("ANDROID_SDK_ROOT") ?: System.getenv("ANDROID_HOME") ?: "")
val configuredNdkDirectory = sequenceOf(
    System.getenv("ANDROID_NDK_HOME"),
    System.getenv("ANDROID_NDK_ROOT"),
    localProperties.getProperty("ndk.dir")
).filterNotNull().firstOrNull { File(it).isDirectory }?.let { File(it) }
    ?: File(androidSdkDirectory, "ndk").listFiles()
        ?.filter { it.isDirectory }
        ?.maxByOrNull { it.name }
    ?: File(androidSdkDirectory, "ndk/27.2.12479018")

fun runNativeSetupCommand(
    command: List<String>,
    extraEnvironment: Map<String, String>,
    showOutput: Boolean = false
): Pair<Int, String> {
    val process = ProcessBuilder(command)
        .redirectErrorStream(true)
        .apply { environment().putAll(extraEnvironment) }
        .start()
    val output = StringBuilder()
    process.inputStream.bufferedReader().useLines { lines ->
        lines.forEach { line ->
            output.appendLine(line)
            if (showOutput) println(line)
        }
    }
    return process.waitFor() to output.toString()
}

val nativeRustTargets = mapOf(
    "arm64-v8a" to "aarch64-linux-android",
    "armeabi-v7a" to "armv7-linux-androideabi",
    "x86_64" to "x86_64-linux-android",
    "x86" to "i686-linux-android"
)

val buildBraveAdblock by tasks.registering(org.gradle.api.tasks.Exec::class) {
    group = "build"
    description = "Build Brave adblock-rust JNI library; install cargo-ndk and Rust targets when missing."
    workingDir(rootProject.file("adblock-rust"))
    inputs.dir(rootProject.file("adblock-rust"))
    inputs.property("situlaAndroidAbis", nativeAbis.joinToString(","))
    outputs.dir(adblockJniLibs)

    environment("PATH", cargoSearchPath)
    environment("CARGO_HOME", cargoHomeDirectory.absolutePath)
    environment("CARGO_TARGET_DIR", layout.buildDirectory.dir("rust-target").get().asFile.absolutePath)
    if (configuredNdkDirectory.isDirectory) {
        environment("ANDROID_NDK_HOME", configuredNdkDirectory.absolutePath)
        environment("ANDROID_NDK_ROOT", configuredNdkDirectory.absolutePath)
    }

    doFirst {
        val nativeEnvironment = mapOf(
            "PATH" to cargoSearchPath,
            "CARGO_HOME" to cargoHomeDirectory.absolutePath
        ) + if (configuredNdkDirectory.isDirectory) {
            mapOf(
                "ANDROID_NDK_HOME" to configuredNdkDirectory.absolutePath,
                "ANDROID_NDK_ROOT" to configuredNdkDirectory.absolutePath
            )
        } else emptyMap()

        // Android Studio often launches Gradle without the user's Cargo bin folder on PATH.
        // Test the actual Cargo subcommand; install it automatically when it is missing.
        val cargoNdkProbe = runNativeSetupCommand(
            listOf("cargo", "ndk", "--help"),
            nativeEnvironment
        )
        if (cargoNdkProbe.first != 0) {
            logger.lifecycle("Situla: cargo-ndk is missing from this Gradle environment; installing it automatically.")
            val install = runNativeSetupCommand(
                listOf("cargo", "install", "cargo-ndk", "--locked"),
                nativeEnvironment,
                showOutput = true
            )
            if (install.first != 0) {
                throw GradleException(
                    "Could not install cargo-ndk (exit ${install.first}). " +
                        "Check that Rust/Cargo is installed and the network is available.\\n${install.second}"
                )
            }
            logger.lifecycle("Situla: cargo-ndk installation completed.")
        }

        val rustTargets = nativeRustTargets.filterKeys { it in nativeAbis }.values
        val installedTargets = runNativeSetupCommand(
            listOf("rustup", "target", "list", "--installed"),
            nativeEnvironment
        )
        if (installedTargets.first != 0) {
            throw GradleException(
                "Rustup is required to prepare Android Rust targets automatically.\\n${installedTargets.second}"
            )
        }
        val installedTargetNames = installedTargets.second.lineSequence().map { it.trim() }.toSet()
        val missingTargets = rustTargets.filterNot { it in installedTargetNames }
        if (missingTargets.isNotEmpty()) {
            logger.lifecycle("Situla: installing missing Rust Android targets: ${missingTargets.joinToString()}")
            val targetInstall = runNativeSetupCommand(
                listOf("rustup", "target", "add") + missingTargets,
                nativeEnvironment,
                showOutput = true
            )
            if (targetInstall.first != 0) {
                throw GradleException(
                    "Could not install Rust Android target(s): ${missingTargets.joinToString()}.\\n${targetInstall.second}"
                )
            }
        }

        if (!configuredNdkDirectory.isDirectory) {
            logger.warn(
                "Situla: Android NDK directory was not resolved from local.properties or environment. " +
                    "cargo-ndk will try its standard Android Studio SDK auto-detection."
            )
        }
    }

    val arguments = mutableListOf("cargo", "ndk")
    nativeAbis.forEach { abi ->
        arguments.add("-t")
        arguments.add(abi)
    }
    arguments.addAll(listOf("-o", adblockJniLibs.get().asFile.absolutePath, "build", "--release"))
    commandLine(arguments)
}

tasks.named("preBuild").configure {
    dependsOn(buildBraveAdblock)
}
