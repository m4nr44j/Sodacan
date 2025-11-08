// client.ts
import { gql } from 'graphql-tag'

export async function fetchUser(client: any) {
  const query = gql`
    query GetUser { user { id name } }
  `
  return client.query({ query })
} 