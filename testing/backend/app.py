from flask import Flask

# This line creates the 'app' object
app = Flask(__name__)

def get_user_data():
    # In a real app, this would fetch data from a database
    return {"user_id": 123, "name": "test"}

@app.route("/api/users")
def get_users():
    return get_user_data()