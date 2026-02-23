export interface FootPrint {
    id:           string;
    reference_id: string;
    profile:      Profile | {};
    facematch:    Facematch | {};
    metrics:      Metrics | {};
    credit_score: number | string;
    trust_score:  number | string;
    phone:        Phone | {};
    email:        Email | {};
    address:      Address | {};
    ip:           IP | {};
}

export interface Address {
    address:     string;
    latitude:    string;
    longitude:   string;
    category:    string;
    type:        string;
    addresstype: string;
}

export interface Email {
    email:              string;
    is_valid:           boolean;
    is_deliverable:     boolean;
    alternative_emails: number;
    disposable:         boolean;
    retro:              Retro;
    breaches:           Breaches;
    domain:             EmailDomain;
    footprint:          EmailFootprint;
}

export interface Breaches {
    services: Service[];
    number:   number;
    first:    Date;
}

export interface Service {
    name: string;
    date: Date;
}

export interface EmailDomain {
    is_free:       boolean;
    whois:         Whois;
    is_corporate:  boolean;
    is_mx_valid:   boolean;
    is_catch_all:  boolean;
    has_webserver: boolean;
}

export interface Whois {
    domain:    WhoisDomain;
    registrar: Registrar;
}

export interface WhoisDomain {
    created_date:    string;
    updated_date:    string;
    expiration_date: string;
    domain:          string;
}

export interface Registrar {
    name:  string;
    phone: string;
    email: string;
}

export interface EmailFootprint {
    nike:     Adobe;
    adobe:    Adobe;
    apple:    Adobe;
    samsung:  Adobe;
    spotify:  Adobe;
    evernote: Adobe;
    facebook: Adobe;
}

export interface Adobe {
    service: string;
    status:  string;
}

export interface Retro {
    total_hits:    number;
    customer_hits: number;
    last_seen:     Date;
    first_seen:    Date;
}

export interface Facematch {
    original: Original;
    photos:   Photo[];
}

export interface Original {
    url:   string;
    faces: Face[];
}

export interface Face {
    x:      number;
    y:      number;
    w:      number;
    h:      number;
    match?: boolean;
}

export interface Photo {
    url:     string;
    faces:   Face[];
    match:   boolean;
    service: string;
}

export interface IP {
    ip:                     string;
    isp:                    string;
    city:                   string;
    country:                string;
    postal_code:            string;
    country_code:           string;
    organization:           string;
    asn:                    string;
    location:               Location;
    is_proxy:               boolean;
    is_mobile:              boolean;
    is_residential:         boolean;
    is_apple_private_relay: boolean;
    is_tor:                 boolean;
    is_vpn:                 boolean;
}

export interface Location {
    latitude:  number;
    longitude: number;
}

export interface Metrics {
    tech:             number;
    social:           number;
    travel:           number;
    old_school:       number;
    gambler:          number;
    shopper:          number;
    solvency:         number;
    digital_presence: number;
}

export interface Phone {
    phone:              string;
    is_valid:           boolean;
    alternative_phones: number;
    disposable:         boolean;
    details:            Details;
    breaches:           any[];
    retro:              Retro;
    footprint:          PhoneFootprint;
}

export interface Details {
    country: string;
    carrier: string;
}

export interface PhoneFootprint {
    skype:     Skype;
    viber:     Viber;
    weibo:     Adobe;
    whatsapp:  Viber;
    instagram: Adobe;
}

export interface Skype {
    service:  string;
    status:   string;
    skype_id: string;
    name:     string;
    country:  string;
    city:     string;
    language: string;
    photo:    string;
}

export interface Viber {
    service: string;
    status:  string;
    photo:   string;
    name?:   string;
    about?:  string;
}

export interface Profile {
    name:       string;
    country:    string;
    gender:     string;
    photos:     string[];
    attributes: Attributes;
}

export interface Attributes {
    phone_email_connected: boolean;
    name_match:            boolean;
    email_age:             number;
    name_in_email:         string;
    suspicious:            boolean;
}
