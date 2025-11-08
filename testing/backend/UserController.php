<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class UserController extends Controller
{
    /**
     * Display a listing of users
     */
    public function index(Request $request): JsonResponse
    {
        $users = User::with('profile')
            ->when($request->search, function($query, $search) {
                return $query->where('name', 'like', "%{$search}%")
                           ->orWhere('email', 'like', "%{$search}%");
            })
            ->paginate(15);

        return response()->json([
            'data' => $users,
            'status' => 'success'
        ]);
    }

    /**
     * Store a newly created user
     */
    public function store(Request $request): JsonResponse
    {
        $validatedData = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users',
            'password' => 'required|string|min:8|confirmed',
        ]);

        DB::beginTransaction();
        
        try {
            $user = User::create([
                'name' => $validatedData['name'],
                'email' => $validatedData['email'],
                'password' => bcrypt($validatedData['password']),
            ]);

            // Clear users cache
            Cache::forget('users_count');
            
            DB::commit();
            Log::info('New user created', ['user_id' => $user->id]);

            return response()->json([
                'data' => $user,
                'message' => 'User created successfully',
                'status' => 'success'
            ], 201);

        } catch (\Exception $e) {
            DB::rollback();
            Log::error('User creation failed', ['error' => $e->getMessage()]);
            
            return response()->json([
                'message' => 'User creation failed',
                'status' => 'error'
            ], 500);
        }
    }

    /**
     * Display the specified user
     */
    public function show(User $user): JsonResponse
    {
        $user->load(['profile', 'orders.items']);
        
        return response()->json([
            'data' => $user,
            'status' => 'success'
        ]);
    }

    /**
     * Update the specified user
     */
    public function update(Request $request, User $user): JsonResponse
    {
        $validatedData = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'email' => 'sometimes|required|string|email|max:255|unique:users,email,' . $user->id,
        ]);

        $user->update($validatedData);
        Cache::forget("user_{$user->id}");

        return response()->json([
            'data' => $user,
            'message' => 'User updated successfully',
            'status' => 'success'
        ]);
    }

    /**
     * Remove the specified user
     */
    public function destroy(User $user): JsonResponse
    {
        DB::transaction(function() use ($user) {
            $user->orders()->delete();
            $user->profile()->delete();
            $user->delete();
        });

        Cache::forget("user_{$user->id}");
        Cache::forget('users_count');

        return response()->json([
            'message' => 'User deleted successfully',
            'status' => 'success'
        ]);
    }

    /**
     * Get user analytics
     */
    public function analytics(): JsonResponse
    {
        $stats = Cache::remember('user_analytics', 3600, function() {
            return [
                'total_users' => User::count(),
                'active_users' => User::where('last_login_at', '>=', now()->subDays(30))->count(),
                'new_users_this_month' => User::whereMonth('created_at', now()->month)->count(),
                'top_users' => User::withCount('orders')
                    ->orderBy('orders_count', 'desc')
                    ->limit(10)
                    ->get()
            ];
        });

        return response()->json([
            'data' => $stats,
            'status' => 'success'
        ]);
    }
} 