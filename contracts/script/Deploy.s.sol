// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {MandateVault} from "../src/MandateVault.sol";
import {VaultFactory} from "../src/VaultFactory.sol";
import {MockERC20} from "../src/MockERC20.sol";
import {MockOracle} from "../src/MockOracle.sol";
import {MockVenue} from "../src/MockVenue.sol";
import {IPriceOracle} from "../src/interfaces/IPriceOracle.sol";
import {ISwapVenue} from "../src/interfaces/ISwapVenue.sol";

/// Deploys the full testnet stack: mocks, oracle, venue, factory, 3 template vaults.
/// Env: PRIVATE_KEY (deployer), AGENT_ADDRESS (agent EOA).
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address agent = vm.envAddress("AGENT_ADDRESS");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);

        MockERC20 mUSD = new MockERC20("Mock Mantle USD", "mUSD");
        MockERC20 mMETH = new MockERC20("Mock mETH", "mMETH");
        MockERC20 mMNT = new MockERC20("Mock MNT", "mMNT");

        MockOracle oracle = new MockOracle();
        oracle.setPrice(address(mUSD), 1e18);
        oracle.setPrice(address(mMETH), 1650e18);
        oracle.setPrice(address(mMNT), 6e17);

        MockVenue venue = new MockVenue(IPriceOracle(address(oracle)));
        mUSD.mint(address(venue), 1_000_000_000e18);
        mMETH.mint(address(venue), 1_000_000e18);
        mMNT.mint(address(venue), 1_000_000_000e18);

        VaultFactory factory =
            new VaultFactory(IPriceOracle(address(oracle)), ISwapVenue(address(venue)), address(mUSD), address(mMETH), address(mMNT));

        address conservative = factory.createVault(0, agent);
        address balanced = factory.createVault(1, agent);
        address aggressive = factory.createVault(2, agent);

        // demo capital for the deployer
        mUSD.mint(deployer, 1_000_000e18);

        vm.stopBroadcast();

        console2.log("mUSD        ", address(mUSD));
        console2.log("mMETH       ", address(mMETH));
        console2.log("mMNT        ", address(mMNT));
        console2.log("oracle      ", address(oracle));
        console2.log("venue       ", address(venue));
        console2.log("factory     ", address(factory));
        console2.log("conservative", conservative);
        console2.log("balanced    ", balanced);
        console2.log("aggressive  ", aggressive);
    }
}
