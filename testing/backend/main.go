package main

import (
    "encoding/json"
    "fmt"
    "log"
    "net/http"
    "github.com/gorilla/mux"
)

// User represents a user in the system
type User struct {
    ID    int    `json:"id"`
    Name  string `json:"name"`
    Email string `json:"email"`
}

// UserService interface defines user operations
type UserService interface {
    GetUsers() []User
    CreateUser(user User) User
    GetUserByID(id int) *User
}

// InMemoryUserService implements UserService
type InMemoryUserService struct {
    users []User
}

func NewUserService() *InMemoryUserService {
    return &InMemoryUserService{
        users: []User{
            {ID: 1, Name: "John Doe", Email: "john@example.com"},
            {ID: 2, Name: "Jane Smith", Email: "jane@example.com"},
        },
    }
}

// GetUsers returns all users
func (s *InMemoryUserService) GetUsers() []User {
    return s.users
}

// CreateUser adds a new user
func (s *InMemoryUserService) CreateUser(user User) User {
    user.ID = len(s.users) + 1
    s.users = append(s.users, user)
    return user
}

// GetUserByID finds a user by ID
func (s *InMemoryUserService) GetUserByID(id int) *User {
    for _, user := range s.users {
        if user.ID == id {
            return &user
        }
    }
    return nil
}

// HTTP Handlers
func getUsersHandler(w http.ResponseWriter, r *http.Request) {
    service := NewUserService()
    users := service.GetUsers()
    
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(users)
}

func createUserHandler(w http.ResponseWriter, r *http.Request) {
    var user User
    if err := json.NewDecoder(r.Body).Decode(&user); err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }
    
    service := NewUserService()
    newUser := service.CreateUser(user)
    
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(http.StatusCreated)
    json.NewEncoder(w).Encode(newUser)
}

func setupRoutes() *mux.Router {
    router := mux.NewRouter()
    
    router.HandleFunc("/api/users", getUsersHandler).Methods("GET")
    router.HandleFunc("/api/users", createUserHandler).Methods("POST")
    
    return router
}

func main() {
    router := setupRoutes()
    
    fmt.Println("Server starting on :8080")
    log.Fatal(http.ListenAndServe(":8080", router))
} 