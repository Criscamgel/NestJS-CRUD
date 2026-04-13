import { PublicUser } from '../../users/interfaces/public-user.interface';

export interface LoginUserResponseData {
  accessToken: string;
  user: PublicUser;
}