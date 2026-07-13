package edu.gdcu.student.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class ApiException(val statusCode: Int, override val message: String) : Exception(message)

class ApiClient(
    private val baseUrl: String,
    private val tokenStore: TokenStore,
) {
    suspend fun login(email: String, password: String): Pair<String, StudentUser> = withContext(Dispatchers.IO) {
        val response = request("auth/login", "POST", JSONObject().apply {
            put("email", email)
            put("password", password)
            put("device_name", "Android student app")
        })
        val data = response.getJSONObject("data")
        val token = data.getString("token")
        val user = parseUser(data.getJSONObject("user"))
        tokenStore.write(token)
        token to user
    }

    suspend fun logout() = withContext(Dispatchers.IO) {
        try {
            request("auth/logout", "POST")
        } finally {
            tokenStore.clear()
        }
    }

    suspend fun dashboard(): StudentDashboard = withContext(Dispatchers.IO) {
        val data = request("dashboard").getJSONObject("data")
        StudentDashboard(
            user = parseUser(data.getJSONObject("user")),
            courses = parseCourses(data.getJSONArray("courses")),
            announcements = parseAnnouncements(data.getJSONArray("announcements")),
            outstandingAmount = data.optDouble("outstanding_amount", 0.0),
        )
    }

    private fun request(path: String, method: String = "GET", body: JSONObject? = null): JSONObject {
        val connection = (URL(baseUrl.trimEnd('/') + "/" + path.trimStart('/')).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 15_000
            readTimeout = 20_000
            setRequestProperty("Accept", "application/json")
            tokenStore.read()?.let { setRequestProperty("Authorization", "Bearer $it") }
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
            }
        }

        try {
            if (body != null) connection.outputStream.use { it.write(body.toString().toByteArray()) }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            val json = if (text.isBlank()) JSONObject() else JSONObject(text)
            if (status !in 200..299) {
                val error = json.optJSONObject("error")
                throw ApiException(status, error?.optString("message") ?: "The request could not be completed.")
            }
            return json
        } finally {
            connection.disconnect()
        }
    }

    private fun parseUser(json: JSONObject) = StudentUser(
        id = json.optInt("id"),
        name = json.optString("name", "Student"),
        email = json.optString("email"),
    )

    private fun parseCourses(json: JSONArray): List<StudentCourse> = buildList {
        for (index in 0 until json.length()) {
            val row = json.getJSONObject(index)
            val enrollment = row.getJSONObject("enrollment")
            val course = row.getJSONObject("course")
            add(
                StudentCourse(
                    id = course.optInt("id"),
                    title = course.optString("title", "Course"),
                    code = course.optString("code"),
                    progress = enrollment.optInt("progress_pct"),
                    status = enrollment.optString("status"),
                ),
            )
        }
    }

    private fun parseAnnouncements(json: JSONArray): List<Announcement> = buildList {
        for (index in 0 until json.length()) {
            val item = json.getJSONObject(index)
            add(Announcement(item.optString("title"), item.optString("body")))
        }
    }
}
