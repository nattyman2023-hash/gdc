package edu.gdcu.student

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.viewmodel.compose.viewModel
import edu.gdcu.student.data.ApiClient
import edu.gdcu.student.data.TokenStore
import edu.gdcu.student.ui.GdcuStudentApp
import edu.gdcu.student.ui.StudentViewModel

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val tokenStore = TokenStore(applicationContext)
        val apiClient = ApiClient(BuildConfig.API_BASE_URL, tokenStore)
        setContent {
            val viewModel: StudentViewModel = viewModel(
                factory = StudentViewModel.factory(apiClient, tokenStore)
            )
            GdcuStudentApp(viewModel)
        }
    }
}
