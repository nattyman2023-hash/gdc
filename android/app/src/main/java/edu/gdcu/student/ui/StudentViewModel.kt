package edu.gdcu.student.ui

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import edu.gdcu.student.data.ApiClient
import edu.gdcu.student.data.ApiException
import edu.gdcu.student.data.StudentDashboard
import edu.gdcu.student.data.TokenStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface StudentScreenState {
    data object SignedOut : StudentScreenState
    data object Loading : StudentScreenState
    data class SignedIn(val dashboard: StudentDashboard) : StudentScreenState
    data class Error(val message: String, val signedIn: Boolean) : StudentScreenState
}

class StudentViewModel(
    private val apiClient: ApiClient,
    private val tokenStore: TokenStore,
) : ViewModel() {
    private val mutableState = MutableStateFlow<StudentScreenState>(
        if (tokenStore.read() == null) StudentScreenState.SignedOut else StudentScreenState.Loading,
    )
    val state: StateFlow<StudentScreenState> = mutableState.asStateFlow()

    init {
        if (tokenStore.read() != null) refresh()
    }

    fun login(email: String, password: String) {
        mutableState.value = StudentScreenState.Loading
        viewModelScope.launch {
            try {
                apiClient.login(email.trim(), password)
                refresh()
            } catch (error: Exception) {
                mutableState.value = StudentScreenState.Error(message(error), signedIn = false)
            }
        }
    }

    fun refresh() {
        mutableState.value = StudentScreenState.Loading
        viewModelScope.launch {
            try {
                mutableState.value = StudentScreenState.SignedIn(apiClient.dashboard())
            } catch (error: Exception) {
                tokenStore.clear()
                mutableState.value = StudentScreenState.Error(message(error), signedIn = false)
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            apiClient.logout()
            mutableState.value = StudentScreenState.SignedOut
        }
    }

    private fun message(error: Exception): String = when (error) {
        is ApiException -> error.message
        else -> "We could not connect to GDCU. Please check your connection and try again."
    }

    companion object {
        fun factory(apiClient: ApiClient, tokenStore: TokenStore): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T {
                    return StudentViewModel(apiClient, tokenStore) as T
                }
            }
    }
}
