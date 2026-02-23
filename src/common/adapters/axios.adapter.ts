import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import { HttpAdapter } from "../interfaces/http-adapter.interface";
import { Injectable } from "@nestjs/common";

@Injectable()
export class AxiosAdapter implements HttpAdapter{

    private axios: AxiosInstance = axios;

    async get<T>(url: string): Promise<T> {
        try {
            const { data } = await this.axios.get<T>(url);
            return data;
        } catch (error) {
            throw new Error('This is an error - Check logs');
        }
    }
    async post<T, D = any>(url: string, datum: D, config?: AxiosRequestConfig): Promise<T> {
        try {
            const { data } = await this.axios.post<T>(url, datum, config);
            return data;
        } catch (error) {
            throw new Error('This is an error - Check logs');
        }
    }

    /* async post<T>(url: string, datum: any): Promise<T> {
        try {
            const { data } = await this.axios.post<T>(url, datum, {
            headers: {
                'X-API-KEY': process.env.KEY_RISKSEAL,
                'Content-Type': 'application/json'
            }
            });
            return data;
        } catch (error) {
            throw new Error('This is an error - Check logs');
        }
    } */

}