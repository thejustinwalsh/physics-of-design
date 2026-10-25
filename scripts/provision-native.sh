#!/bin/sh
set -eu
pod_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$pod_root"
mkdir -p artifacts/runtime/java artifacts/runtime/android-sdk/cmdline-tools artifacts/runtime/android-avd
curl -fL --retry 3 -o artifacts/runtime/java.tar.gz 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.13%2B9/OpenJDK21U-jdk_aarch64_mac_hotspot_21.0.13_9.tar.gz'
printf '%s\n' 'bf036b35b071bfb2f54f2c0af8ee8d88afa95ee6eb3dce02c0f94cfc2524d04a  artifacts/runtime/java.tar.gz' | shasum -a 256 -c -
tar -xzf artifacts/runtime/java.tar.gz -C artifacts/runtime/java
curl -fL --retry 3 -o artifacts/runtime/android-tools.zip https://dl.google.com/android/repository/commandlinetools-mac_arm64-15859902_latest.zip
printf '%s\n' '835b62a26162b229b441d1f6d4680383815a270809eb33522c0d480fa5002c4e  artifacts/runtime/android-tools.zip' | shasum -a 256 -c -
if [ ! -d artifacts/runtime/android-sdk/cmdline-tools/latest ]; then
  unzip -q artifacts/runtime/android-tools.zip -d artifacts/runtime/android-sdk/cmdline-tools
  mv artifacts/runtime/android-sdk/cmdline-tools/cmdline-tools artifacts/runtime/android-sdk/cmdline-tools/latest
fi
export JAVA_HOME="$pod_root/artifacts/runtime/java/jdk-21.0.13+9/Contents/Home" ANDROID_USER_HOME="$pod_root/artifacts/runtime/android-user" ANDROID_AVD_HOME="$pod_root/artifacts/runtime/android-avd"
# This explicit provisioning command accepts the SDK licenses for this project-local installation.
yes | artifacts/runtime/android-sdk/cmdline-tools/latest/bin/sdkmanager --sdk_root="$pod_root/artifacts/runtime/android-sdk" --licenses > artifacts/runtime/android-licenses.log
artifacts/runtime/android-sdk/cmdline-tools/latest/bin/sdkmanager --sdk_root="$pod_root/artifacts/runtime/android-sdk" 'platform-tools' 'emulator' 'system-images;android-36;default;arm64-v8a'
if [ ! -f "$ANDROID_AVD_HOME/physics-design.ini" ]; then
  printf 'no\n' | artifacts/runtime/android-sdk/cmdline-tools/latest/bin/avdmanager create avd -n physics-design -k 'system-images;android-36;default;arm64-v8a' --device pixel_7 --path "$ANDROID_AVD_HOME/physics-design.avd"
fi
npm ci --prefix native
__UNSAFE_EXPO_HOME_DIRECTORY="$pod_root/artifacts/expo-home" EXPO_NO_TELEMETRY=1 node --input-type=module - <<'JS'
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{downloadExpoGoAsync}=require('./native/node_modules/expo/node_modules/@expo/cli/build/src/utils/downloadExpoGoAsync.js');
await downloadExpoGoAsync('android',{sdkVersion:'58.0.0'});await downloadExpoGoAsync('ios',{sdkVersion:'58.0.0'});
JS
