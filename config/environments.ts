import dotenv from 'dotenv';

dotenv.config();

export interface EnvironmentConfig {
  baseURL: string;
  frontendURL: string;
  env: string;
}

export function getEnvironmentConfig(): EnvironmentConfig {
  return {
    baseURL: process.env.BASE_URL || 'http://10.10.80.37:3005',
    frontendURL: process.env.FRONTEND_URL || 'http://10.10.80.37:5174',
    env: process.env.TEST_ENV || 'staging',
  };
}
