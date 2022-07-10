import * as anchor from "@project-serum/anchor";
import * as splToken from "@solana/spl-token";
import { Program } from "@project-serum/anchor";
import { Betbook1, IDL } from "../target/types/betbook1";
import * as sdk from "../sdk/index";

describe("betbook1", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.Betbook1 as Program<Betbook1>;

  it("full lifecycle with SDK", async () => {
    const [mint, user1KP, user2KP, adminKP] = await setupSDK(
      program.provider.connection
    );

    const user1 = new sdk.Client(
      program.provider.connection,
      user1KP,
      program.programId
    );
    const user2 = new sdk.Client(
      program.provider.connection,
      user2KP,
      program.programId
    );
    const admin = new sdk.Client(
      program.provider.connection,
      adminKP,
      program.programId
    );

    // challenge args
    const challengeName = "come-at-me";
    const challengeAmt = new anchor.BN(100);
    const side = true;

    const createChallengeTxSig = await user1.createChallenge(
      challengeName,
      challengeAmt,
      side,
      mint
    );
    console.log("createChallengeTxSig: %s", createChallengeTxSig);

    const acceptChallengeTxSig = await user2.acceptChallenge(
      challengeName,
      user1.provider.wallet.publicKey,
      mint
    );
    console.log("acceptChallengeTxSig: %s", acceptChallengeTxSig);

    const postResultTxSig = await admin.postResult(
      challengeName,
      user1.provider.wallet.publicKey,
      mint,
      true
    );
    console.log("postResultTxSig: %s", postResultTxSig);
  });
});

// setup returns [mint, user1, user2]
// both users are seeded with lamports and the mint
async function setup(
  connection: anchor.web3.Connection,
  programId: anchor.web3.PublicKey
): Promise<
  [anchor.web3.PublicKey, anchor.Program<Betbook1>, anchor.Program<Betbook1>]
> {
  // pays for all setup and is the mint authority
  const payer = await initWallet(connection);

  // create mint used to be bet on
  const mint = anchor.web3.Keypair.generate();
  await splToken.createMint(
    connection,
    payer,
    payer.publicKey,
    payer.publicKey,
    9,
    mint,
    { commitment: "confirmed" }
  );

  // create user1 with ATA for new mint
  const user1 = await initWallet(connection);
  const user1Ata = await splToken.getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint.publicKey,
    user1.publicKey
  );

  // create user2 with ATA for new mint
  const user2 = await initWallet(connection);
  const user2Ata = await splToken.getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint.publicKey,
    user2.publicKey
  );

  // mint tokens for each user
  await splToken.mintTo(
    connection,
    payer,
    mint.publicKey,
    user1Ata.address,
    payer,
    10000,
    [],
    { commitment: "confirmed" }
  );
  await splToken.mintTo(
    connection,
    payer,
    mint.publicKey,
    user2Ata.address,
    payer,
    10000,
    [],
    { commitment: "confirmed" }
  );

  const user1Provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(user1),
    { commitment: "confirmed" }
  );
  const user1Program: Program<Betbook1> = new anchor.Program(
    IDL,
    programId,
    user1Provider
  );

  const user2Provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(user2),
    { commitment: "confirmed" }
  );
  const user2Program: Program<Betbook1> = new anchor.Program(
    IDL,
    programId,
    user2Provider
  );

  return [mint.publicKey, user1Program, user2Program];
}

// setup returns [mint, user1, user2]
// both users are seeded with lamports and the mint
async function setupSDK(
  connection: anchor.web3.Connection
): Promise<
  [
    anchor.web3.PublicKey,
    anchor.web3.Keypair,
    anchor.web3.Keypair,
    anchor.web3.Keypair
  ]
> {
  // pays for all setup and is the mint authority
  const payer = await initWallet(connection);

  // create mint used to be bet on
  const mint = anchor.web3.Keypair.generate();
  await splToken.createMint(
    connection,
    payer,
    payer.publicKey,
    payer.publicKey,
    9,
    mint,
    { commitment: "confirmed" }
  );

  // create user1 with ATA for new mint
  const user1 = await initWallet(connection);
  const user1Ata = await splToken.getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint.publicKey,
    user1.publicKey
  );

  // create user2 with ATA for new mint
  const user2 = await initWallet(connection);
  const user2Ata = await splToken.getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint.publicKey,
    user2.publicKey
  );

  // create user3 with ATA for new mint
  const user3 = await initWallet(connection);
  const user3Ata = await splToken.getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint.publicKey,
    user3.publicKey
  );

  // mint tokens for each user
  await splToken.mintTo(
    connection,
    payer,
    mint.publicKey,
    user1Ata.address,
    payer,
    10000,
    [],
    { commitment: "confirmed" }
  );
  await splToken.mintTo(
    connection,
    payer,
    mint.publicKey,
    user2Ata.address,
    payer,
    10000,
    [],
    { commitment: "confirmed" }
  );
  await splToken.mintTo(
    connection,
    payer,
    mint.publicKey,
    user3Ata.address,
    payer,
    10000,
    [],
    { commitment: "confirmed" }
  );

  return [mint.publicKey, user1, user2, user3];
}

// create a new wallet and seed it with lamports
async function initWallet(
  connection: anchor.web3.Connection
): Promise<anchor.web3.Keypair> {
  const wallet = anchor.web3.Keypair.generate();

  const airdropTxSig = await connection.requestAirdrop(
    wallet.publicKey,
    100_000_000_000
  );
  await connection.confirmTransaction(airdropTxSig, "confirmed");

  return wallet;
}
