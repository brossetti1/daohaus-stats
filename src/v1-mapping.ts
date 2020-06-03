import { BigInt, log, Address, EthereumBlock } from "@graphprotocol/graph-ts";
import {
  V1Moloch as Contract,
  SummonComplete,
  ProcessProposal,
  Ragequit,
  SubmitProposal,
  SubmitVote,
} from "../generated/templates/MolochV1Template/V1Moloch";
import { Erc20 as Token } from "../generated/templates/MolochV1Template/Erc20";
import { Guildbank } from "../generated/templates/MolochV1Template/Guildbank";
import { Moloch, Balance } from "../generated/schema";

// TODO: How to show:
// Value in over-time
// Value out over-time

function addBalance(
  daoAddress: Address,
  block: EthereumBlock,
  direction: string,
  action: string,
  amount: BigInt = BigInt.fromI32(0)
): void {
  let contract = Contract.bind(daoAddress);
  let guildBankAddress = contract.guildBank();
  let guildBank = Guildbank.bind(guildBankAddress);
  let tokenAddress = guildBank.approvedToken();
  let token = Token.bind(tokenAddress);

  let balanceId = daoAddress
    .toHex()
    .concat("-")
    .concat(block.number.toString())
    .concat("-")
    .concat(tokenAddress.toHexString());
  let balance = new Balance(balanceId);

  let balanceValue = token.try_balanceOf(guildBankAddress);
  if (balanceValue.reverted) {
    log.info(
      "balanceOf reverted daoAddress {}, tokenAddress, {}, guildBank, {}",
      [
        daoAddress.toHexString(),
        tokenAddress.toHexString(),
        guildBankAddress.toHexString(),
      ]
    );
    balance.balance = BigInt.fromI32(0);
  } else {
    balance.balance = balanceValue.value;
  }

  let sharesValue = contract.try_totalShares();
  if (balanceValue.reverted) {
    log.info("totalShares reverted daoAddress {}", [daoAddress.toHexString()]);
    balance.shares = BigInt.fromI32(0);
  } else {
    balance.shares = sharesValue.value;
  }

  balance.timestamp = block.timestamp.toString();
  balance.tokenAddress = tokenAddress;
  balance.molochAddress = daoAddress;
  balance.moloch = daoAddress.toHex();
  balance.withdraw = direction == "withdraw";
  balance.deposit = direction == "deposit";
  balance.action = action;

  balance.amount = amount;
  if (action == "rageQuit") {
    let shareValue = balance.shares.div(balance.balance);
    balance.amount = amount.times(shareValue);
    log.info("rageQuit shareValue, shares, amount {}", [
      shareValue.toString(),
      amount.toString(),
      balance.amount.toString(),
    ]);
  }

  balance.save();
}

export function handleSummonComplete(event: SummonComplete): void {
  let molochId = event.address.toHex();
  let moloch = Moloch.load(molochId);
  if (moloch.newContract == "0") {
    return;
  }

  let contract = Contract.bind(event.address);
  let guildBankAddress = contract.guildBank();
  moloch.summoningTime = contract.summoningTime();
  moloch.guildBankAddress = guildBankAddress;
  moloch.save();

  addBalance(event.address, event.block, "initial", "summon");
}

export function handleSubmitProposal(event: SubmitProposal): void {
  let molochId = event.address.toHexString();
  let moloch = Moloch.load(molochId);
  if (moloch.newContract == "0") {
    return;
  }

  moloch.proposalCount = moloch.proposalCount.plus(BigInt.fromI32(1));

  moloch.save();
}

export function handleSubmitVote(event: SubmitVote): void {
  let molochId = event.address.toHexString();
  let moloch = Moloch.load(molochId);
  if (moloch.newContract == "0") {
    return;
  }

  moloch.voteCount = moloch.voteCount.plus(BigInt.fromI32(1));

  moloch.save();
}

export function handleProcessProposal(event: ProcessProposal): void {
  // if (event.params.didPass && event.params.tokenTribute > BigInt.fromI32(0)) {

  if (event.params.didPass) {
    addBalance(
      event.address,
      event.block,
      "deposit",
      "processProposal",
      event.params.tokenTribute
    );
  }
}

export function handleRagequit(event: Ragequit): void {
  let molochId = event.address.toHexString();
  let moloch = Moloch.load(molochId);
  if (moloch.newContract == "0") {
    return;
  }

  moloch.rageQuitCount = moloch.rageQuitCount.plus(BigInt.fromI32(1));

  moloch.save();

  addBalance(
    event.address,
    event.block,
    "withdraw",
    "rageQuit",
    event.params.sharesToBurn
  );
}

export function handleSummonCompleteLegacy(event: SummonComplete): void {
  let molochId = event.address.toHex();
  let moloch = new Moloch(molochId);

  let title =
    event.address.toHex() == "0x1fd169a4f5c59acf79d0fd5d91d1201ef1bce9f1"
      ? "Moloch DAO"
      : "MetaCartel DAO";
  moloch.title = title;

  moloch.newContract = "1";
  moloch.version = "1";
  moloch.deleted = false;
  moloch.summoner = event.params.summoner;
  moloch.timestamp = event.block.timestamp.toString();
  moloch.proposalCount = BigInt.fromI32(0);
  moloch.memberCount = BigInt.fromI32(0);
  moloch.voteCount = BigInt.fromI32(0);
  moloch.rageQuitCount = BigInt.fromI32(0);

  let contract = Contract.bind(event.address);
  moloch.summoningTime = contract.summoningTime();
  moloch.guildBankAddress = contract.guildBank();

  moloch.save();
}
