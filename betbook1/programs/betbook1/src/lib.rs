use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;
use anchor_spl::{self, token};
use spl_memo::build_memo;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod betbook1 {

    use super::*;

    // initialize the betbook
    // define the admin and fee accounts
    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }

    // post a challenge, declare how many tokens are at stake and which side
    pub fn challenge(ctx: Context<Challenge>, name: String, amount: u64, side: bool) -> Result<()> {
        // amount cannot be 0 or less
        if amount <= 0 {
            return err!(ErrorCodes::InvalidAmount);
        };

        // set manager and config data
        let manager = &mut ctx.accounts.manager;
        manager.config = ctx.accounts.config.key();
        manager.vault = ctx.accounts.vault.key();

        let config = &mut ctx.accounts.config;
        config.name = name;
        config.amount = amount;
        config.challenger = ctx.accounts.user.key();
        config.challenger_side = side;
        config.taker = None;

        // transfer tokens from user to vault
        let transfer_accounts = token::Transfer {
            from: ctx.accounts.user_ata.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                transfer_accounts,
            ),
            amount,
        )
    }

    // accept a challenge, transfer the required amount of tokens to the vault
    pub fn accept(ctx: Context<Accept>, _name: String, _challenger: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.config;
        // if challenge is already accepted, exit with error
        if config.taker != None {
            return err!(ErrorCodes::ChallengeTaken);
        }

        // set taker to user pubkey
        config.taker = Some(ctx.accounts.user.key());

        // transfer tokens from user to vault
        let transfer_accounts = token::Transfer {
            from: ctx.accounts.user_ata.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                transfer_accounts,
            ),
            ctx.accounts.config.amount,
        )
    }

    // randomness oracle posts the result of the challenge, this determines the winner
    // send winnings to the winner
    // send fee to me
    // close accounts and send lamports back to challenger
    pub fn post_result(
        ctx: Context<PostResult>,
        _name: String,
        _challenger: Pubkey,
        winning_side: bool,
    ) -> Result<()> {
        // write memo on chain recording the results of the bet
        let memo = format!(
            "winner: {}, winning_side: {}, winnings: {}",
            ctx.accounts.winner.key().to_string(),
            winning_side,
            ctx.accounts.vault.amount
        );
        let memo_ix = build_memo(memo.as_bytes(), &[]);
        invoke(&memo_ix, &[ctx.accounts.memo_program.to_account_info()])?;

        // transfer tokens from vault to winner_ata
        let transfer_accounts = token::Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.winner_ata.to_account_info(),
            authority: ctx.accounts.manager.to_account_info(),
        };

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                transfer_accounts,
                &[&[
                    ctx.accounts.vault.key().as_ref(),
                    &[*ctx.bumps.get("manager").unwrap()],
                ]],
            ),
            ctx.accounts.vault.amount,
        )
    }

    // close an open challenge and receive the tokens back from the vault minus the fee
    pub fn close_challenge(_ctx: Context<CloseChallenge>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}

#[derive(Accounts)]
#[instruction(name: String, amount: u64, side: bool)]
pub struct Challenge<'info> {
    pub mint: Account<'info, token::Mint>,

    #[account(init, payer = user, space = ChallengeConfig::MAX_SIZE, seeds = [mint.key().as_ref(), name.as_bytes(), user.key().as_ref()], bump)]
    pub config: Account<'info, ChallengeConfig>,

    #[account(init, payer = user, seeds = [config.key().as_ref()], bump, token::mint = mint, token::authority = manager)]
    pub vault: Account<'info, token::TokenAccount>,

    #[account(init, payer = user, space = Manager::MAX_SIZE, seeds = [vault.key().as_ref()], bump)]
    pub manager: Account<'info, Manager>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut, associated_token::mint = mint, associated_token::authority = user)]
    pub user_ata: Account<'info, token::TokenAccount>,

    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
    pub token_program: Program<'info, token::Token>,
}

#[account]
#[derive(Default)]
pub struct ChallengeConfig {
    name: String,
    amount: u64,
    challenger: Pubkey,
    challenger_side: bool,
    taker: Option<Pubkey>,
}

impl ChallengeConfig {
    pub const MAX_SIZE: usize = 8 + 100 + 8 + 32 + 1 + 33;
}

#[account]
#[derive(Default)]
pub struct Manager {
    pub vault: Pubkey,
    pub config: Pubkey,
}

impl Manager {
    pub const MAX_SIZE: usize = 8 + 32 + 32;
}

#[derive(Accounts)]
#[instruction(name: String, challenger: Pubkey)]
pub struct Accept<'info> {
    pub mint: Account<'info, token::Mint>,

    #[account(seeds = [mint.key().as_ref(), name.as_bytes(), challenger.as_ref()], bump)]
    pub config: Account<'info, ChallengeConfig>,

    #[account(mut, seeds = [config.key().as_ref()], bump, token::mint = mint, token::authority = manager)]
    pub vault: Account<'info, token::TokenAccount>,

    #[account(seeds = [vault.key().as_ref()], bump, has_one = vault, has_one = config)]
    pub manager: Account<'info, Manager>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut, associated_token::mint = mint, associated_token::authority = user)]
    pub user_ata: Account<'info, token::TokenAccount>,

    pub token_program: Program<'info, token::Token>,
}

#[derive(Accounts)]
#[instruction(name: String, challenger: Pubkey)]
pub struct PostResult<'info> {
    pub mint: Account<'info, token::Mint>,

    #[account(seeds = [mint.key().as_ref(), name.as_bytes(), challenger.as_ref()], bump)]
    pub config: Account<'info, ChallengeConfig>,

    #[account(mut, seeds = [config.key().as_ref()], bump, token::mint = mint, token::authority = manager)]
    pub vault: Account<'info, token::TokenAccount>,

    #[account(seeds = [vault.key().as_ref()], bump, has_one = vault, has_one = config)]
    pub manager: Account<'info, Manager>,

    /// CHECK: todo
    #[account()]
    pub winner: AccountInfo<'info>,

    #[account(mut, associated_token::mint = mint, associated_token::authority = winner)]
    pub winner_ata: Account<'info, token::TokenAccount>,

    #[account(mut)]
    pub admin: Signer<'info>,

    pub token_program: Program<'info, token::Token>,

    /// CHECK: todo
    #[account(address = spl_memo::ID)]
    pub memo_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct CloseChallenge {}

#[error_code]
pub enum ErrorCodes {
    #[msg("This challenge has already been taken")]
    ChallengeTaken,

    #[msg("Invalid bet amount")]
    InvalidAmount,
}
