# GDCU Student Android app

This is the student-only Android client for the GDCU LMS. It currently includes:

- student login and logout;
- encrypted bearer-token storage using Android Keystore;
- student dashboard;
- enrolled-course progress;
- announcements and outstanding balance display.

The app talks to the LMS through `/api/mobile/v1`. The API rejects non-student
accounts and scopes every protected request to the student token.

## Open and run

Open the `android` directory in Android Studio. The project uses Kotlin,
Jetpack Compose, and Java 17. Set the live API host when building:

```text
./gradlew assembleDebug -PgdcuApiBaseUrl=https://YOUR-GDCU-HOST/api/mobile/v1/
```

The default URL is intentionally a placeholder. This prevents a debug build
from accidentally pointing at an unknown production host.

The Android SDK/Gradle toolchain is not installed in the LMS workspace, so the
project must be compiled from Android Studio or a CI runner with the Android
SDK installed.
