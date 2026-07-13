package edu.gdcu.student.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import edu.gdcu.student.data.StudentDashboard

@Composable
fun GdcuStudentApp(viewModel: StudentViewModel) {
    MaterialTheme {
        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            when (val state = viewModel.state.collectAsState().value) {
                StudentScreenState.SignedOut -> LoginScreen(onLogin = viewModel::login)
                StudentScreenState.Loading -> LoadingScreen()
                is StudentScreenState.Error -> LoginScreen(
                    initialError = state.message,
                    onLogin = viewModel::login,
                )
                is StudentScreenState.SignedIn -> DashboardScreen(
                    dashboard = state.dashboard,
                    onRefresh = viewModel::refresh,
                    onLogout = viewModel::logout,
                )
            }
        }
    }
}

@Composable
private fun LoginScreen(initialError: String? = null, onLogin: (String, String) -> Unit) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember(initialError) { mutableStateOf(initialError) }

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Text("GDCU Student", style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(8.dp))
        Text("Sign in to access your student portal.")
        Spacer(Modifier.height(24.dp))
        OutlinedTextField(email, { email = it; error = null }, Modifier.fillMaxWidth(), label = { Text("Email") }, singleLine = true)
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            password,
            { password = it; error = null },
            Modifier.fillMaxWidth(),
            label = { Text("Password") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
        )
        if (!error.isNullOrBlank()) {
            Spacer(Modifier.height(12.dp))
            Text(error.orEmpty(), color = MaterialTheme.colorScheme.error)
        }
        Spacer(Modifier.height(20.dp))
        Button(
            onClick = { onLogin(email, password) },
            enabled = email.isNotBlank() && password.isNotBlank(),
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Sign in") }
    }
}

@Composable
private fun LoadingScreen() {
    Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        CircularProgressIndicator()
        Spacer(Modifier.height(16.dp))
        Text("Loading your student workspace…")
    }
}

@Composable
private fun DashboardScreen(dashboard: StudentDashboard, onRefresh: () -> Unit, onLogout: () -> Unit) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Column {
                    Text("Welcome back", style = MaterialTheme.typography.labelLarge)
                    Text(dashboard.user.name, style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
                }
                OutlinedButton(onClick = onLogout) { Text("Sign out") }
            }
        }
        item {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text("Outstanding balance", style = MaterialTheme.typography.labelLarge)
                    Text("£${"%.2f".format(dashboard.outstandingAmount)}", style = MaterialTheme.typography.headlineSmall)
                }
            }
        }
        item { Text("My courses", style = MaterialTheme.typography.titleLarge) }
        if (dashboard.courses.isEmpty()) {
            item { Text("Your enrolled courses will appear here.") }
        } else {
            items(dashboard.courses) { course ->
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp)) {
                        Text(course.title, style = MaterialTheme.typography.titleMedium)
                        if (course.code.isNotBlank()) Text(course.code, style = MaterialTheme.typography.labelMedium)
                        Spacer(Modifier.height(8.dp))
                        Text("${course.progress}% complete")
                    }
                }
            }
        }
        if (dashboard.announcements.isNotEmpty()) {
            item { Text("Announcements", style = MaterialTheme.typography.titleLarge) }
            items(dashboard.announcements) { announcement ->
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(16.dp)) {
                        Text(announcement.title, style = MaterialTheme.typography.titleMedium)
                        Spacer(Modifier.height(4.dp))
                        Text(announcement.body)
                    }
                }
            }
        }
        item { OutlinedButton(onClick = onRefresh, modifier = Modifier.fillMaxWidth()) { Text("Refresh") } }
    }
}
