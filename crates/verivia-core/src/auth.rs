use std::collections::HashMap;

use bcrypt::{hash, verify, DEFAULT_COST};
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use sqlx::PgPool;

use crate::errors::{AppError, Result};
use crate::models::{JwtClaims, LoginResponse, RoleFlags, UserProfile};

/// JWT secret — loaded from JWT_SECRET environment variable.
/// In debug builds, falls back to a dev-only default.
/// In release builds, panics if JWT_SECRET is not set (security requirement).
fn jwt_secret() -> String {
    match std::env::var("JWT_SECRET") {
        Ok(secret) => secret,
        Err(_) => {
            if cfg!(debug_assertions) {
                "verivia-dev-secret-DO-NOT-USE-IN-PROD".to_string()
            } else {
                panic!("JWT_SECRET environment variable must be set in production")
            }
        }
    }
}

/// Token validity duration: 7 days
const TOKEN_EXPIRY_SECS: usize = 7 * 24 * 60 * 60;

// ─────────────────────────── Login ───────────────────────────

pub async fn login(pool: &PgPool, email: &str, password: &str) -> Result<LoginResponse> {
    // 1) Find user by email
    let user = sqlx::query_as!(
        crate::models::User,
        "SELECT id, email, password_hash FROM users WHERE email = $1",
        email
    )
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::Auth("Credențiale invalide".into()))?;

    // 2) Verify password
    if !verify(password, &user.password_hash).unwrap_or(false) {
        return Err(AppError::Auth("Credențiale invalide".into()));
    }

    // 3) Fetch roles
    let profile = build_user_profile(pool, user.id, &user.email).await?;

    // 4) Issue JWT
    let claims = JwtClaims {
        sub: user.id,
        email: user.email.clone(),
        exp: jsonwebtoken::get_current_timestamp() as usize + TOKEN_EXPIRY_SECS,
    };
    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(jwt_secret().as_bytes()),
    )?;

    Ok(LoginResponse {
        token,
        user: profile,
    })
}

// ─────────────────────────── Register ───────────────────────────

pub async fn register(
    pool: &PgPool,
    email: &str,
    password: &str,
    roles: &HashMap<String, RoleFlags>,
) -> Result<()> {
    // Validation
    if !email.contains('@') {
        return Err(AppError::Validation("Adresa de e-mail este invalidă".into()));
    }
    if password.len() < 6 {
        return Err(AppError::Validation(
            "Parola trebuie să aibă cel puțin 6 caractere".into(),
        ));
    }

    // Hash password before starting transaction (CPU-intensive, don't hold tx open)
    let password_hash = hash(password, DEFAULT_COST)?;

    let mut tx = pool.begin().await?;

    // Check uniqueness inside transaction (prevents TOCTOU race)
    let exists = sqlx::query_scalar!(
        "SELECT EXISTS(SELECT 1 FROM users WHERE email = $1) as \"exists!\"",
        email
    )
    .fetch_one(&mut *tx)
    .await?;

    if exists {
        return Err(AppError::Validation(
            "Există deja un cont cu această adresă".into(),
        ));
    }

    // Insert user
    let user_id = sqlx::query_scalar!(
        "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id",
        email,
        password_hash
    )
    .fetch_one(&mut *tx)
    .await?;

    // Insert roles
    for (category, flags) in roles {
        sqlx::query!(
            "INSERT INTO user_roles (user_id, category, is_editor, is_verificator)
             VALUES ($1, $2, $3, $4)",
            user_id,
            category,
            flags.editor,
            flags.verificator
        )
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(())
}

// ─────────────────────────── JWT Verification ───────────────────────────

pub fn verify_token(token: &str) -> Result<JwtClaims> {
    let data = decode::<JwtClaims>(
        token,
        &DecodingKey::from_secret(jwt_secret().as_bytes()),
        &Validation::default(),
    )?;
    Ok(data.claims)
}

// ─────────────────────────── Helpers ───────────────────────────

async fn build_user_profile(pool: &PgPool, user_id: i32, email: &str) -> Result<UserProfile> {
    let role_rows = sqlx::query_as!(
        crate::models::UserRole,
        "SELECT id, user_id, category, is_editor, is_verificator
         FROM user_roles WHERE user_id = $1",
        user_id
    )
    .fetch_all(pool)
    .await?;

    let mut roles = HashMap::new();
    for r in role_rows {
        roles.insert(
            r.category,
            RoleFlags {
                editor: r.is_editor,
                verificator: r.is_verificator,
            },
        );
    }

    Ok(UserProfile {
        id: user_id,
        email: email.to_string(),
        roles,
    })
}
