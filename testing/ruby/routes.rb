Rails.application.routes.draw do
  get '/api/rails', to: 'home#index'
  post '/api/rails', to: 'home#create'
end 