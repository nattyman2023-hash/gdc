package edu.gdcu.student.data

data class StudentUser(
    val id: Int,
    val name: String,
    val email: String,
)

data class StudentCourse(
    val id: Int,
    val title: String,
    val code: String,
    val progress: Int,
    val status: String,
)

data class Announcement(
    val title: String,
    val body: String,
)

data class StudentDashboard(
    val user: StudentUser,
    val courses: List<StudentCourse>,
    val announcements: List<Announcement>,
    val outstandingAmount: Double,
)
