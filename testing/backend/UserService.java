/* Sample Spring-style service file for AST analysis; stripped of actual Spring dependencies */
// package com.example.service;
// import org.springframework.web.bind.annotation.*;

import java.util.List;

// @RestController
// @RequestMapping("/api")
public class UserService {
    private UserRepository userRepository;

    public UserService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    // @GetMapping("/users")
    public List<User> getAllUsers() {
        return userRepository.findAll();
    }

    // @PostMapping("/users")
    public User createUser(/* @RequestBody */ User user) {
        return userRepository.save(user);
    }

    // @GetMapping("/users/{id}")
    public User getUserById(/* @PathVariable */ Long id) {
        return userRepository.findById(id);
    }

    // Helper method
    @SuppressWarnings("unused")
    private void validateUser(User user) {
        if (user.getName() == null || user.getName().isEmpty()) {
            throw new IllegalArgumentException("User name cannot be empty");
        }
    }
}

interface UserRepository {
    List<User> findAll();
    User save(User user);
    User findById(Long id);
}

class User {
    private Long id;
    private String name;
    private String email;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
}