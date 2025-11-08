use std::collections::HashMap;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: u64,
    pub name: String,
    pub email: String,
    pub active: bool,
}

#[derive(Debug)]
pub enum UserRole {
    Admin,
    Editor,
    Viewer,
}

pub trait Repository<T> {
    fn find_by_id(&self, id: u64) -> Option<T>;
    fn save(&mut self, item: T) -> Result<(), String>;
    fn delete(&mut self, id: u64) -> bool;
}

pub struct InMemoryUserRepository {
    users: HashMap<u64, User>,
    next_id: u64,
}

impl InMemoryUserRepository {
    pub fn new() -> Self {
        Self {
            users: HashMap::new(),
            next_id: 1,
        }
    }
    
    pub fn seed_data(&mut self) {
        let admin = User {
            id: self.next_id,
            name: "Admin User".to_string(),
            email: "admin@example.com".to_string(),
            active: true,
        };
        self.users.insert(self.next_id, admin);
        self.next_id += 1;
    }
}

impl Repository<User> for InMemoryUserRepository {
    fn find_by_id(&self, id: u64) -> Option<User> {
        self.users.get(&id).cloned()
    }
    
    fn save(&mut self, mut user: User) -> Result<(), String> {
        if user.id == 0 {
            user.id = self.next_id;
            self.next_id += 1;
        }
        
        if user.name.is_empty() {
            return Err("User name cannot be empty".to_string());
        }
        
        self.users.insert(user.id, user);
        Ok(())
    }
    
    fn delete(&mut self, id: u64) -> bool {
        self.users.remove(&id).is_some()
    }
}

pub fn validate_email(email: &str) -> bool {
    email.contains('@') && email.contains('.')
}

pub fn create_user(name: String, email: String) -> Result<User, String> {
    if name.trim().is_empty() {
        return Err("Name cannot be empty".to_string());
    }
    
    if !validate_email(&email) {
        return Err("Invalid email format".to_string());
    }
    
    Ok(User {
        id: 0, // Will be assigned by repository
        name,
        email,
        active: true,
    })
}

macro_rules! log_info {
    ($($arg:tt)*) => {
        println!("[INFO] {}", format!($($arg)*));
    };
}

pub mod utils {
    pub fn hash_password(password: &str) -> String {
        // Simple hash implementation for demo
        format!("hashed_{}", password)
    }
    
    pub fn generate_token() -> String {
        use std::time::{SystemTime, UNIX_EPOCH};
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        format!("token_{}", timestamp)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_user_creation() {
        let user = create_user("John Doe".to_string(), "john@example.com".to_string());
        assert!(user.is_ok());
    }
    
    #[test]
    fn test_repository() {
        let mut repo = InMemoryUserRepository::new();
        let user = User {
            id: 1,
            name: "Test User".to_string(),
            email: "test@example.com".to_string(),
            active: true,
        };
        
        assert!(repo.save(user).is_ok());
        assert!(repo.find_by_id(1).is_some());
    }
} 