import 'dart:convert';
import 'package:http/http.dart' as http;

class ApiService {
  // Replace with your actual deployed API URL or local IP for testing
  static const String baseUrl = 'http://localhost:3000/api/chat';

  Future<String> sendMessage(String userId, String message) async {
    try {
      final response = await http.post(
        Uri.parse(baseUrl),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'userId': userId,
          'message': message,
        }),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return data['reply'] ?? "Bestie is speechless... try again?";
      } else {
        final errorData = jsonDecode(response.body);
        return "Error: ${errorData['error'] ?? 'Unknown error'}";
      }
    } catch (e) {
      return "Connection failed. Make sure the backend is running.";
    }
  }
}

class ChatMessage {
  final String content;
  final bool isUser;
  final DateTime timestamp;

  ChatMessage({required this.content, required this.isUser, required this.timestamp});
}


