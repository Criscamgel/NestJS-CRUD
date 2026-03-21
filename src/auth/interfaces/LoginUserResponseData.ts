
export interface LoginUserResponseData {
  accessToken: string;
  user: {
    id: string;
    email: string;
    password?: string;
  };
}