import * as anchor from "@project-serum/anchor";
import * as splToken from "@solana/spl-token";
import { Program } from "@project-serum/anchor";
import { Betbook1, IDL } from "../target/types/betbook1";

export class Client {
  program: anchor.Program<Betbook1>;
  provider: anchor.AnchorProvider;

  constructor(
    connection: anchor.web3.Connection,
    user: anchor.web3.Keypair,
    programId: anchor.web3.PublicKey
  ) {
    const provider = new anchor.AnchorProvider(
      connection,
      new anchor.Wallet(user),
      { commitment: "confirmed" }
    );
    const program: Program<Betbook1> = new anchor.Program(
      IDL,
      programId,
      provider
    );
    this.program = program;
    this.provider = program.provider as anchor.AnchorProvider;
  }

  async createChallenge(
    name: string,
    amount: anchor.BN,
    side: boolean,
    mint: anchor.web3.PublicKey
  ): Promise<string> {
    // get challenge PDAs
    const [config, _configBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [
        mint.toBuffer(),
        Buffer.from(name),
        this.provider.wallet.publicKey.toBuffer(),
      ],
      this.program.programId
    );

    const [vault, _vaultBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [config.toBuffer()],
      this.program.programId
    );

    const [manager, _managerBump] =
      anchor.web3.PublicKey.findProgramAddressSync(
        [vault.toBuffer()],
        this.program.programId
      );

    // get ATA for the wallet, expected to already have one for the given mint
    const ata = await splToken.getAssociatedTokenAddress(
      mint,
      this.provider.wallet.publicKey
    );

    const txSig = await this.program.methods
      .challenge(name, amount, side)
      .accounts({
        mint: mint,
        config: config,
        vault: vault,
        manager: manager,
        user: this.provider.wallet.publicKey,
        userAta: ata,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        tokenProgram: splToken.TOKEN_PROGRAM_ID,
      })
      .rpc();

    return txSig;
  }

  async acceptChallenge(
    name: string,
    challenger: anchor.web3.PublicKey,
    mint: anchor.web3.PublicKey
  ): Promise<string> {
    const [config, _configBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [mint.toBuffer(), Buffer.from(name), challenger.toBuffer()],
      this.program.programId
    );

    const [vault, _vaultBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [config.toBuffer()],
      this.program.programId
    );

    const [manager, _managerBump] =
      anchor.web3.PublicKey.findProgramAddressSync(
        [vault.toBuffer()],
        this.program.programId
      );

    // get ATA for the wallet, expected to already have one for the given mint
    const ata = await splToken.getAssociatedTokenAddress(
      mint,
      this.provider.wallet.publicKey
    );

    const txSig = await this.program.methods
      .accept(name, challenger)
      .accounts({
        mint: mint,
        config: config,
        vault: vault,
        manager: manager,
        user: this.provider.wallet.publicKey,
        userAta: ata,
        tokenProgram: splToken.TOKEN_PROGRAM_ID,
      })
      .rpc();

    return txSig;
  }

  async postResult(
    name: string,
    challenger: anchor.web3.PublicKey,
    mint: anchor.web3.PublicKey,
    winningSide: boolean
  ): Promise<string> {
    // get challenge PDAs
    const [config, _configBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [mint.toBuffer(), Buffer.from(name), challenger.toBuffer()],
      this.program.programId
    );

    const [vault, _vaultBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [config.toBuffer()],
      this.program.programId
    );

    const [manager, _managerBump] =
      anchor.web3.PublicKey.findProgramAddressSync(
        [vault.toBuffer()],
        this.program.programId
      );

    // fetch onchain config data
    const configData = await this.program.account.challengeConfig.fetch(config);

    // detect winner based on result
    let winner = challenger;
    if (configData.challengerSide !== winningSide) {
      winner = configData.taker;
    }

    // get ATA for the wallet, expected to already have one for the given mint
    const winnerAta = await splToken.getAssociatedTokenAddress(mint, winner);

    // post result on chain
    const txSig = await this.program.methods
      .postResult(name, challenger, winningSide)
      .accounts({
        mint: mint,
        config: config,
        vault: vault,
        manager: manager,
        admin: this.provider.wallet.publicKey,
        winner: winner,
        winnerAta: winnerAta,
        tokenProgram: splToken.TOKEN_PROGRAM_ID,
        memoProgram: new anchor.web3.PublicKey(
          "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
        ),
      })
      .rpc();

    return txSig;
  }
}
